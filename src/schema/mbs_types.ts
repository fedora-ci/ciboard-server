/*
 * This file is part of ciboard-server
 *
 * Copyright (c) 2021, 2023 Andrei Stepanov <astepano@redhat.com>
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
import debug from 'debug';
import * as graphql from 'graphql';
import {
  GraphQLInt,
  GraphQLList,
  GraphQLString,
  GraphQLBoolean,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLFieldConfig,
} from 'graphql';
import { delegateToSchema } from '@graphql-tools/delegate';

import schema from './schema';
import { CommitObject, DistGitInstanceInputType } from './distgit_types';
import {
  KojiHistoryType,
  KojiBuildTagsType,
  KojiInstanceInputType,
} from './koji_types';
import * as mbs from '../services/mbs';

const log = debug('osci:mbs_types');

const mkNvrForModuleBuild = (
  name: string,
  stream: string,
  version: string,
  context: string,
) => `${name}-${stream}-${version}.${context}`;

export interface MbsTaskFields {
  /**
   * Name of the component comprising the task.
   */
  component: string;
  /**
   * Koji task ID. This can be empty the task is scheduled but it's canceled before
   * it's started. This happens, for example, when a failed build of another component
   * in the module cancels the whole build.
   */
  id?: number;
  /**
   * NVR of the RPM build.
   */
  nvr: string;
  /**
   * State number. Can be 1 (success), 3 (canceled), or 4 (failed).
   */
  state: number;
}

export const MbsTaskType = new GraphQLObjectType<MbsTaskFields, {}>({
  name: 'MbsTaskType',
  fields: {
    component: {
      description: 'Name of the component comprising the task',
      type: new GraphQLNonNull(GraphQLString),
    },
    id: {
      description:
        "ID of the Koji task. Can be null if the task is canceled before it's started",
      type: GraphQLInt,
    },
    nvr: {
      description: 'Full NVR of the comprising package',
      type: new GraphQLNonNull(GraphQLString),
    },
    state: {
      description:
        'Number of the state the task is currently in. Can be 1 (success), 3 (canceled), or 4 (failed).',
      type: new GraphQLNonNull(GraphQLInt),
    },
  },
});

export interface MbsBuildFields {
  commit: any;
  context: string;
  id: number;
  koji_tag: string;
  name: string;
  nvr: string;
  owner: string;
  scmurl?: string;
  scratch: boolean;
  stream: string;
  tasks: MbsTaskFields[];
  time_completed?: string;
  version: string;
}

interface MbsBuildCommitArgs {
  instance: string;
}

/*
 * TOOD: The third type argument should really be `MbsBuildCommitArgs`, but using
 * that causes a type error further down below in when passing the resolver to the
 * `resolve` field of `commit` within `MbsBuildType`.
 */
const commitResolver: graphql.GraphQLFieldResolver<any, {}, any> = async (
  parentValue,
  args,
  context,
  info,
) => {
  const { scmurl } = parentValue;
  const { instance } = args;
  const nameWithCommit = _.last(_.split(scmurl, 'modules/'));
  const [repoNameDotGit, sha1] = _.split(nameWithCommit, '?#');
  const repoName = _.replace(repoNameDotGit, /.git$/, '');
  if (!repoName || !sha1) {
    throw new Error(
      `Could not parse repo name and commit from URL '${scmurl}'`,
    );
  }
  log('Getting commit object for %s:%s', repoName, sha1);
  return await delegateToSchema({
    schema: schema,
    operation: 'query',
    fieldName: 'distgitCommit',
    args: {
      commit_sha1: sha1,
      instance,
      namespace: 'modules',
      repo_name: repoName,
    },
    context,
    info,
  });
};

const nvrResolver: graphql.GraphQLFieldResolver<any, {}, any> = (
  parentValue,
) => {
  const { context, name, stream, version } = parentValue;
  const nvr = mkNvrForModuleBuild(name, stream, version, context);
  return nvr;
};

const tagHistoryResolver: graphql.GraphQLFieldResolver<any, {}, any> = async (
  parentValue,
  args,
  schemaContext,
  info,
) => {
  const { instance } = args;
  const nvr = nvrResolver(parentValue, args, schemaContext, info);
  log('Delegating Koji tagging history query for NVR %s', nvr);
  return await delegateToSchema({
    schema,
    operation: 'query',
    fieldName: 'kojiBuildHistoryByNvr',
    args: {
      instance,
      nvr,
    },
    context: schemaContext,
    info,
  });
};

const tagsResolver: graphql.GraphQLFieldResolver<any, {}, any> = async (
  parentValue,
  args,
  schemaContext,
  info,
) => {
  const { instance } = args;
  const nvr = nvrResolver(parentValue, args, schemaContext, info);
  log('Delegating Koji tags query for NVR %s', nvr);
  return await delegateToSchema({
    schema: schema,
    operation: 'query',
    fieldName: 'kojiBuildTagsByNvr',
    args: {
      instance,
      nvr,
    },
    context: schemaContext,
    info,
  });
};

export const MbsBuildType = new GraphQLObjectType<MbsBuildFields, {}>({
  name: 'MbsBuildType',
  fields: {
    commit: {
      description:
        'Commit object correponding to the source Git commit of the build',
      type: CommitObject,
      args: {
        instance: {
          type: DistGitInstanceInputType,
          description: 'Dist-git instance identifer',
          defaultValue: 'fp',
        },
      },
      resolve: commitResolver,
    },
    context: {
      description: 'Module context identifier. The ‘C’ in NSVC',
      type: new GraphQLNonNull(GraphQLString),
    },
    id: {
      description: 'Module build ID',
      type: new GraphQLNonNull(GraphQLInt),
    },
    koji_tag: {
      description:
        'The corresponding Koji tag where the module components are built',
      type: new GraphQLNonNull(GraphQLString),
    },
    name: {
      description: 'Name of the package. The ‘N’ in NSVC.',
      type: new GraphQLNonNull(GraphQLString),
    },
    nvr: {
      description: 'NVR of the build in the form ‘N-S-V.C’',
      type: new GraphQLNonNull(GraphQLString),
      resolve: nvrResolver,
    },
    owner: {
      description: 'Owner/initiator of the module build',
      type: new GraphQLNonNull(GraphQLString),
    },
    scmurl: {
      description: 'URL of the Git commit from which the module is built',
      type: GraphQLString,
    },
    scratch: {
      description: 'Flag indication if the module build is a scratch build',
      type: new GraphQLNonNull(GraphQLBoolean),
    },
    stream: {
      description: 'Module stream identifier. The ‘S’ in NSVC.',
      type: new GraphQLNonNull(GraphQLString),
    },
    tag_history: {
      description: 'History of current and former tags for this module build',
      type: KojiHistoryType,
      args: {
        instance: {
          type: KojiInstanceInputType,
          description: 'Koji hub name',
          defaultValue: 'fedoraproject',
        },
      },
      resolve: tagHistoryResolver,
    },
    tags: {
      description: 'List of currently active Koji tags for this module build',
      type: new GraphQLList(KojiBuildTagsType),
      args: {
        instance: {
          type: KojiInstanceInputType,
          description: 'Koji hub name',
          defaultValue: 'fedoraproject',
        },
      },
      resolve: tagsResolver,
    },
    // TODO: Would it be sensible to delegate this field to `koji_task`?
    tasks: {
      description: 'List of Koji tasks comprising the module build',
      type: new GraphQLNonNull(GraphQLList(GraphQLNonNull(MbsTaskType))),
    },
    time_completed: {
      description:
        'Date and time when the module build was finished in ISO 8601 format',
      type: GraphQLString,
    },
    version: {
      description: 'Module version identifier. The ‘V’ in NSVC.',
      type: new GraphQLNonNull(GraphQLString),
    },
  },
});

export const MbsInstanceInputType = new graphql.GraphQLEnumType({
  name: 'MbsInstanceInputType',
  values: {
    cs: { value: 'cs' },
    fp: { value: 'fp' },
    rh: { value: 'rh' },
    pn: { value: 'pn' },
  },
});

export const queryMbsBuild: GraphQLFieldConfig<any, any> = {
  type: MbsBuildType,
  description:
    'Query for data on a module build from the Module Build System (MBS)',
  args: {
    build_id: {
      type: new GraphQLNonNull(GraphQLInt),
      description: 'ID of the MBS build to look up',
    },
    instance: {
      type: MbsInstanceInputType,
      description: 'Identifier of the Module Build System instance to query',
      defaultValue: MbsInstanceInputType.getValue('rh'),
    },
  },
  async resolve(_parentValue, args) {
    const { build_id, instance } = args;
    log('Querying MBS instance ‘%s’ for build ID %s', instance, build_id);
    const reply = await mbs.queryModuleBuild(instance, build_id);
    log('MBS reply: %o', reply);
    return reply;
  },
};
