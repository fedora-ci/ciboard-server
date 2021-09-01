/*
 * This file is part of ciboard-server

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
const {
  GraphQLInt,
  GraphQLList,
  GraphQLFloat,
  GraphQLString,
  GraphQLBoolean,
  GraphQLObjectType,
} = graphql;

import { koji_query } from '../services/kojibrew';
import { CommitObject } from './distgit_types';
import { delegateToSchema } from '@graphql-tools/delegate';
import { GraphQLNonNull } from 'graphql';

const log = debug('osci:brew_types');

/**
 * API informaion sources:
 *
 * * ➜ brew list-api
 * * https://koji.fedoraproject.org/koji/api
 */

/**
 * Test XMLRPC call in commandline:
 *
 * ➜ curl -k --data @brew-call-getTaskInfo.xml https://brewhub.../brewhub
 * ➜ cat brew-call-getTaskInfo.xml
 * <?xml version="1.0" encoding="UTF-8"?>
 * <methodCall>
 * <methodName>getTaskInfo</methodName>
 * <params>
 *     <value><int>36339137</int></value>
 * <param>
 * </param>
 * </params>
 * </methodCall>
 */
export const KojiTaskInfoType = new GraphQLObjectType({
  name: 'KojiTaskInfoType',
  fields: () => ({
    /** 18225592 */
    id: { type: GraphQLInt },
    /** noarch */
    arch: { type: GraphQLString },
    /** 2021-04-21 14:12:07.397541 */
    completion_time: { type: GraphQLString },
    /** 1619014327.39754 */
    completion_ts: { type: GraphQLFloat },
    /** 2021-04-21 14:02:45.081178 */
    create_time: { type: GraphQLString },
    /** 1619013765.08118 */
    create_ts: { type: GraphQLFloat },
    /** 2021-04-21 14:03:22.103917 */
    start_time: { type: GraphQLString },
    /** 1619013802.10392 */
    start_ts: { type: GraphQLFloat },
    /** 2577 */
    owner: { type: GraphQLInt },
    builds: {
      type: new GraphQLList(KojiBuildInfoType),
      args: {
        koji_instance: {
          type: KojiInstanceInputType,
          description: 'Koji hub name',
          defaultValue: 'fedoraproject',
        },
        task_id: {
          type: new GraphQLNonNull(GraphQLInt),
          description: 'Task id to lookup',
        },
      },
      async resolve(parentValue, args, context, info) {
        /**
         * Args shouldn't be shared between resolvers
         * https://stackoverflow.com/questions/48382897/graphql-access-arguments-in-child-resolvers/63300135#63300135
         */
        const { task_id, koji_instance } = args;
        log(' [i] Query brew for listBuilds. Task id : %s', task_id);
        const reply = await koji_query(koji_instance, 'listBuilds', {
          __starstar: true,
          taskID: task_id,
        });
        log('Koji reply: %o', reply);
        return reply;
      },
    },
  }),
});

export const KojiBuildInfoType = new GraphQLObjectType({
  name: 'KojiBuildInfoType',
  fields: () => ({
    /** 763774 */
    build_id: { type: GraphQLInt },
    /** '2018-09-07 19:40:05.647378' */
    completion_time: { type: GraphQLString },
    /** 1536349205.64738 */
    completion_ts: { type: GraphQLFloat },
    /** 21526585 */
    creation_event_id: { type: GraphQLInt },
    /** '2018-09-07 19:38:30.101120' */
    creation_time: { type: GraphQLString },
    /** 1536349110.10112 */
    creation_ts: { type: GraphQLFloat },
    /** null */
    epoch: { type: GraphQLString },
    /**
     * { original_url: 'git://.../rpms/glibc32#f3414d8f24b5dc8d15a085dbc8a4a8be2ffb4d39' }
     */
    extra: {
      type: new GraphQLObjectType({
        name: 'KojiBuildExtraInfoType',
        fields: {
          original_url: { type: GraphQLString },
        },
      }),
    },
    /** 'glibc32' */
    name: { type: GraphQLString },
    /** 'glibc32-2.28-1.1.el8' */
    nvr: { type: GraphQLString },
    /** 1665 */
    owner_id: { type: GraphQLInt },
    /** 'tdawson' */
    owner_name: { type: GraphQLString },
    /** 577 */
    package_id: { type: GraphQLInt },
    /** 'glibc32' */
    package_name: { type: GraphQLString },
    /** '1.1.el8' */
    release: { type: GraphQLString },
    /** 'git://.../rpms/glibc32#f3414d8f24b5dc8d15a085dbc8a4a8be2ffb4d39' */
    source: { type: GraphQLString },
    /** '2018-09-07 19:38:30.101120' */
    start_time: { type: GraphQLString },
    /** 1536349110.10112 */
    start_ts: { type: GraphQLFloat },
    /** 1 */
    state: { type: GraphQLInt },
    /** 18225592 */
    task_id: { type: GraphQLInt },
    /** '2.28' */
    version: { type: GraphQLString },
    /** 9 */
    volume_id: { type: GraphQLInt },
    /** 'rhel-8' */
    volume_name: { type: GraphQLString },
    /** History */
    history: {
      type: KojiHistoryType,
      resolve(parentValue, args, context, info) {
        const schema = require('./schema');
        const { build_id } = parentValue;
        log('Getting Koji history for build id: %s', build_id);
        /**
         * https://www.graphql-tools.com/docs/schema-delegation/
         */
        if (!build_id) {
          return {};
        }
        return delegateToSchema({
          schema: schema,
          operation: 'query',
          fieldName: 'brew_build_history',
          args: {
            build_id,
          },
          context,
          info,
        });
      },
    },
    tags: {
      type: new GraphQLList(KojiBuildTagsType),
      resolve(parentValue, args, context, info) {
        const schema = require('./schema');
        const { build_id } = parentValue;
        log('Getting Koji tags for build id: %s', build_id);
        /**
         * https://www.graphql-tools.com/docs/schema-delegation/
         */
        if (!build_id) {
          return {};
        }
        return delegateToSchema({
          schema: schema,
          operation: 'query',
          fieldName: 'brew_build_tags',
          args: {
            build_id,
          },
          context,
          info,
        });
      },
    },
    /** Git commit object */
    commit_obj: {
      type: CommitObject,
      resolve(parentValue, args, context, info) {
        const schema = require('./schema');
        const { source } = parentValue;
        const name_sha1 = _.last(_.split(source, 'rpms/'));
        const [name, sha1] = _.split(name_sha1, '#');
        log('Getting commit-object for %s:%s', name, sha1);
        if (!_.every([name, sha1])) {
          return {};
        }
        return delegateToSchema({
          schema: schema,
          operation: 'query',
          fieldName: 'distgit_commit',
          args: {
            repo_name: name,
            commit_sha1: sha1,
            distgit_name: 'rh',
          },
          context,
          info,
        });
      },
    },
  }),
});

const KojiBuildTagType = new GraphQLObjectType({
  name: 'KojiBuildTagType',
  fields: () => ({
    /** true */
    active: { type: GraphQLBoolean },
    /** build.state: 1  */
    build_state: { type: GraphQLInt },
    /** 763774 */
    build_id: { type: GraphQLInt },
    /** 21526604 */
    create_event: { type: GraphQLInt },
    /** 1536349212.39007 */
    create_ts: { type: GraphQLFloat },
    /** 1665 */
    creator_id: { type: GraphQLInt },
    /**  tdawson */
    creator_name: { type: GraphQLString },
    /** null */
    epoch: { type: GraphQLString },
    /** glibc32 */
    name: { type: GraphQLString },
    /** 1.1.el8 */
    release: { type: GraphQLString },
    /** null */
    revoke_event: { type: GraphQLString },
    /** null */
    revoke_ts: { type: GraphQLFloat },
    /** null */
    revoker_id: { type: GraphQLInt },
    /** null */
    revoker_name: { type: GraphQLString },
    /** tag.name: rhel-8.0.0-build */
    tag_name: { type: GraphQLString },
    /** 11323 */
    tag_id: { type: GraphQLInt },
  }),
});

export const KojiBuildTagsType = new GraphQLObjectType({
  name: 'KojiBuildTagsType',
  fields: () => ({
    /** 'aarch64 ppc64le i686 x86_64 s390x' */
    arches: { type: GraphQLString },
    /** 81553 */
    id: { type: GraphQLInt },
    /** false */
    locked: { type: GraphQLBoolean },
    /** false */
    maven_include_all: { type: GraphQLBoolean },
    /** false */
    maven_support: { type: GraphQLBoolean },
    /** 'kpatch-kernel-4.18.0-305.el8-build' */
    name: { type: GraphQLString },
    /** 'admin' */
    perm: { type: GraphQLString },
    /** 1 */
    perm_id: { type: GraphQLInt },
  }),
});

export const KojiHistoryType = new GraphQLObjectType({
  name: 'KojiHistoryType',
  fields: () => ({
    tag_listing: { type: new GraphQLList(KojiBuildTagType) },
  }),
});

export const KojiInstanceInputType = new graphql.GraphQLEnumType({
  name: 'KojiInstanceInputType',
  values: {
    rh: { value: 'brew' },
    fp: { value: 'fedoraproject' },
    cs: { value: 'centos_stream' },
  },
});
