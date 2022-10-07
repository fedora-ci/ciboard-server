/*
 * This file is part of ciboard-server
 *
 * Copyright (c) 2021 Andrei Stepanov <astepano@redhat.com>
 * Copyright (c) 2022 Matěj Grabovský <mgrabovs@redhat.com>
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 3 of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */

import _ from 'lodash';
import axios, { AxiosResponse } from 'axios';
import debug from 'debug';
import { z } from 'zod';

import { MbsInstance, getcfg } from '../cfg';

const cfg = getcfg();
const log = debug('osci:mbs');

interface MbsTaskResponse {
  nvr?: string;
  state: number;
  state_reason: string;
  task_id?: number;
}

interface MbsModuleBuildResponse {
  /** Module context. The last component of the NSVC */
  context: string;
  /** Module build ID */
  id: number;
  koji_tag: string;
  /** Module name. The first component of the NSVC */
  name: string;
  /** Build owner name */
  owner: string;
  /** Git commit URL */
  scmurl: string;
  /** Is this a scratch build? */
  scratch: boolean;
  state_name: string;
  /** Module stream. The second component of the NSVC */
  stream: string;
  // TODO: Can there be more artifact types other than RPMs in a module build?
  tasks: { rpms?: Record<string, MbsTaskResponse> };
  time_completed?: string;
  /** Module version. The third component of the NSVC */
  version: string;
}

export const mbsTaskSchema = z.object({
  component: z.string(),
  id: z.number().optional(),
  nvr: z.string().optional(),
  state: z.number(),
});

export type MbsTask = z.infer<typeof mbsTaskSchema>;

/**
 * This schema fragment preprocesses the dictionary tasks of a module build
 * into a form that is more suitable for further processing.
 *
 * The structure we receive from MBS looks like
 *
 *     ...
 *     tasks: {
 *       rpms: {
 *         component1: {
 *           nvr: "component1-2.3.4-9.module+el8.4.0+1111+aeb4ae67",
 *           state: 1,
 *           task_id: 90909090,
 *         },
 *         component2: { ... },
 *         ...
 *       }
 *     }
 *     ...
 *
 * This schema fragment takes the RPM part of the component–task map and turns it
 * into a list of tasks. It ignores non-RPM tasks that might appear in the response
 * from MBS. After the schema is applied, the output looks like
 *
 *     [
 *       { component: "component1", nvr: "component1-2.3.4-...", ... },
 *       { component: "component2", ... },
 *       ...
 *     ]
 */
const rpmsTasksSchema = z.preprocess((input) => {
  const tasks = input as MbsModuleBuildResponse['tasks'] | undefined;
  if (!tasks || !tasks.rpms) return [];
  const rpmTasks = Object.entries(tasks.rpms).map(([component, task]) => ({
    component,
    id: task.task_id,
    nvr: task.nvr,
    state: task.state,
  }));
  /*
   * Remove tasks with no NVR. These seem to occur sporadically in edge cases
   * but they offer no useful information.
   */
  return rpmTasks.filter((task) => !_.isEmpty(task.nvr));
}, mbsTaskSchema.array());

export const moduleBuildSchema = z.object({
  /** Module context. The last component of the NSVC */
  context: z.string(),
  /** Module build ID */
  id: z.number(),
  /** The target Koji tag where the module is built */
  koji_tag: z.string(),
  /** Module name. The first component of the NSVC */
  name: z.string(),
  /** Build owner name */
  owner: z.string(),
  /** Git commit URL */
  scmurl: z.string(),
  /** Is this a scratch build? */
  scratch: z.boolean(),
  state_name: z.string(),
  /** Module stream. The second component of the NSVC */
  stream: z.string(),
  /** List of Koji tasks comprising the module build */
  tasks: rpmsTasksSchema,
  /** Timestamp of when the build was completed. MBS should supply this in ISO 8601 format */
  time_completed: z.string().optional(),
  /** Module version. The third component of the NSVC */
  version: z.string(),
});

export type ModuleBuild = z.infer<typeof moduleBuildSchema>;

export const queryModuleBuild = async (
  instanceId: MbsInstance,
  buildId: number,
): Promise<ModuleBuild> => {
  const instanceUrl = cfg.mbs[instanceId]?.url;
  if (!instanceUrl)
    throw new Error(`URL not configured for the '${instanceId}' MBS instance`);
  const url = `${instanceUrl}/module-builds/${buildId}`;

  let response: AxiosResponse<any> | undefined;
  try {
    response = await axios.get(url);
  } catch (responseError) {
    log('Could not retrieve URL %s. Error: %o', url, responseError);
    throw new Error(`Error communicating with MBS: ${responseError}`);
  }

  try {
    const parsed = await moduleBuildSchema.parseAsync(response?.data);
    return parsed;
  } catch (parsingError) {
    if (parsingError instanceof z.ZodError) {
      const formattedError = parsingError.format();
      log('Could not parse response from MBS: %o', formattedError);
      throw new Error(
        `Could not parse response from MBS: ${JSON.stringify(formattedError)}`,
      );
    }
    log('Could not parse response from MBS: %o', parsingError);
    throw parsingError;
  }
};
