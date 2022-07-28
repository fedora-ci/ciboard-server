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
  task_id?: number;
  nvr?: string;
  state: number;
  state_reason: string;
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
  // TODO: Use a more appropriate type?
  tasks: { rpms?: Record<string, MbsTaskResponse> };
  time_completed?: string;
  /** Module version. The third component of the NSVC */
  version: string;
}

const mbsTaskSchema = z.object({
  component: z.string(),
  id: z.number().optional(),
  nvr: z.string().optional(),
  state: z.number(),
});

export type MbsTask = z.infer<typeof mbsTaskSchema>;

const rpmsTasksSchema = z.preprocess((tasks) => {
  const { rpms } = tasks as MbsModuleBuildResponse['tasks'];
  if (!rpms) return [];
  return Object.entries(rpms).map(([component, task]) => ({
    component,
    id: task.task_id,
    nvr: task.nvr,
    state: task.state,
  }));
}, mbsTaskSchema.array());

const mbsModuleBuildSchema = z.object({
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
  /* TODO: This needs a bit more wrangling.
   * The response from MBS API has the form
   *    ...
   *    tasks: {
   *      rpms: {
   *        component1: { ... },
   *        component2: { ... },
   *        ...
   *      }
   *    }
   *    ...
   * Q: Are other kinds of artifacts other than "rpm" supported?
   * Q: Can the `tasks` field be missing or null? Can it be `{}`?
   *    Can `tasks.rpms` be missing or null?
   * We want the output to be a list, such as
   *    ...
   *    tasks: [
   *      { component: "component1", ... },
   *      { component: "component2", ... },
   *      ...
   *    ]
   *    ...
   */
  // TODO: Preprocess.
  tasks: rpmsTasksSchema,
  /** Timestamp of when the build was completed. MBS should supply this in ISO 8601 format */
  time_completed: z.string().optional(),
  /** Module version. The third component of the NSVC */
  version: z.string(),
});

export type MbsModuleBuild = z.infer<typeof mbsModuleBuildSchema>;

export const queryModuleBuild = async (
  instanceId: MbsInstance,
  buildId: number
): Promise<MbsModuleBuild | undefined> => {
  // TODO: Make sure build_id is validated as an integer somewhere in the pipeline.
  const instanceUrl = cfg.mbs[instanceId]?.url;
  const url = `${instanceUrl}/module-builds/${buildId}`;
  let response: AxiosResponse<any> | undefined;
  try {
    response = await axios.get(url);
    const parsed = await mbsModuleBuildSchema.parseAsync(response?.data);
    return parsed;
  } catch (responseError) {
    // TODO: Handle errors and return an appropriate response.
    log('Cannot proccess %s. Error: %o', url, responseError);
  }
};
