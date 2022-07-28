/*
 * This file is part of ciboard-server
 *
 * Copyright (c) 2021 Andrei Stepanov <astepano@redhat.com>
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
  GraphQLBoolean,
  GraphQLFloat,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLString,
} from 'graphql';
import { delegateToSchema } from '@graphql-tools/delegate';

import { CommitObject, DistGitInstanceInputType } from './distgit_types';
import schema from './schema';

const log = debug('osci:mbs_types');

export const MbsTaskType = new GraphQLObjectType({
  name: 'MbsTaskType',
  fields: () => ({
    component: { type: GraphQLNonNull(GraphQLString) },
    id: { type: GraphQLInt },
    nvr: { type: GraphQLNonNull(GraphQLString) },
    state: { type: GraphQLNonNull(GraphQLInt) },
  }),
});

export const MbsBuildType = new GraphQLObjectType({
  name: 'MbsBuildType',
  fields: () => ({
    context: { type: GraphQLNonNull(GraphQLString) },
    id: { type: GraphQLNonNull(GraphQLInt) },
    // TODO: Can we delegate this field anywhere? We don't seem to have a `koji_tag`
    // query to ask for info on a specific tag.
    koji_tag: { type: GraphQLNonNull(GraphQLString) },
    name: { type: GraphQLNonNull(GraphQLString) },
    owner: { type: GraphQLNonNull(GraphQLString) },
    // TODO: Should we delegate the commit info to `distgit_commit`?
    scmurl: { type: GraphQLNonNull(GraphQLString) },
    scratch: { type: GraphQLNonNull(GraphQLBoolean) },
    stream: { type: GraphQLNonNull(GraphQLString) },
    // TODO: Would it be sensible to delegate this field to `koji_task`?
    tasks: { type: GraphQLNonNull(GraphQLList(GraphQLNonNull(MbsTaskType))) },
    time_completed: {
      description: 'Timestamp when build was finished',
      type: GraphQLString,
    },
    version: { type: GraphQLNonNull(GraphQLString) },
    /*
    commit_obj: {
      type: CommitObject,
      args: {
        instance: {
          type: DistGitInstanceInputType,
          description: 'Dist-git name',
          defaultValue: 'fp',
        },
      },
      async resolve(parentValue, args, context, info) {
        const { source } = parentValue;
        const { instance } = args;
        const name_sha1 = _.last(_.split(source, 'rpms/'));
        const [name_dot_git, sha1] = _.split(name_sha1, '#');
        const name = _.replace(name_dot_git, /.git$/, '');
        log('Getting commit-object for %s:%s', name, sha1);
        if (!_.every([name, sha1])) {
          return {};
        }
        const co = await delegateToSchema({
          schema: schema,
          operation: 'query',
          fieldName: 'distgit_commit',
          args: {
            repo_name: name,
            commit_sha1: sha1,
            instance,
          },
          context,
          info,
        });
        return co;
      },
    },
    */
  }),
});

export const MbsInstanceInputType = new graphql.GraphQLEnumType({
  name: 'MbsInstanceInputType',
  values: {
    cs: { value: 'cs' },
    fp: { value: 'fp' },
    rh: { value: 'rh' },
  },
});
