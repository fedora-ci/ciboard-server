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
import pako from 'pako';
import axios from 'axios';
import * as graphql from 'graphql';
import { delegateToSchema } from '@graphql-tools/delegate';
import { GreenWaiveDecisionType, greenwave } from './greenwaive_types';
import { GreenwaveProductsType, KnownTypes, known_types } from '../cfg';
import { GraphQLUnionType } from 'graphql';

const debug = require('debug');
const log = debug('osci:db_types');

const {
  GraphQLID,
  GraphQLInt,
  GraphQLList,
  GraphQLString,
  GraphQLBoolean,
  GraphQLObjectType,
} = graphql;

const StateCiType = new GraphQLObjectType({
  name: 'StateCiType',
  fields: () => ({
    irc: { type: GraphQLString },
    url: { type: GraphQLString },
    name: { type: GraphQLString },
    team: { type: GraphQLString },
    email: { type: GraphQLString },
  }),
});

const StateContactType = new GraphQLObjectType({
  name: 'StateContactType',
  fields: () => ({
    irc: { type: GraphQLString },
    url: { type: GraphQLString },
    docs: { type: GraphQLString },
    name: { type: GraphQLString },
    team: { type: GraphQLString },
    email: { type: GraphQLString },
    version: { type: GraphQLString },
  }),
});

const StateOriginType = new GraphQLObjectType({
  name: 'StateOriginType',
  fields: () => ({
    reason: { type: GraphQLString },
    creator: { type: GraphQLString },
  }),
});

const StateSystemType = new GraphQLObjectType({
  name: 'StateSystemType',
  fields: () => ({
    os: { type: GraphQLString },
    label: { type: GraphQLString },
    provider: { type: GraphQLString },
    architecture: { type: GraphQLString },
  }),
});

const StatePipelineType = new GraphQLObjectType({
  name: 'StatePipelineType',
  fields: () => ({
    id: { type: GraphQLString },
    name: { type: GraphQLString },
    build: { type: GraphQLString },
    stage: { type: GraphQLString },
  }),
});

const StateRunAdditinalInfoType = new GraphQLObjectType({
  name: 'StateRunAdditinalInfoType',
  fields: () => ({
    module: { type: GraphQLString },
    actual_module: { type: GraphQLString },
    additional_info: { type: new GraphQLList(GraphQLString) },
  }),
});

const StateRunType = new GraphQLObjectType({
  name: 'StateRunType',
  fields: () => ({
    log: { type: GraphQLString },
    url: { type: GraphQLString },
    debug: { type: GraphQLString },
    rebuild: { type: GraphQLString },
    log_raw: { type: GraphQLString },
    log_stream: { type: GraphQLString },
    trigger_rebuild: { type: GraphQLString },
    additional_info: {
      type: new GraphQLList(StateRunAdditinalInfoType),
    },
  }),
});

/**
 * https://pagure.io/fedora-ci/messages/blob/master/f/schemas/error.yaml
 */
const StateErrorType = new GraphQLObjectType({
  name: 'StateErrorType',
  fields: () => ({
    issue_url: { type: GraphQLString },
    reason: { type: GraphQLString },
  }),
});

const StateTestType = new GraphQLObjectType({
  name: 'StateTestType',
  fields: () => ({
    type: { type: GraphQLString },
    docs: { type: GraphQLString },
    note: { type: GraphQLString },
    result: { type: GraphQLString },
    category: { type: GraphQLString },
    namespace: { type: GraphQLString },
  }),
});

const StateArtifactType = new GraphQLObjectType({
  name: 'StateArtifactType',
  fields: () => ({
    id: { type: GraphQLString },
    nvr: { type: GraphQLString },
    type: { type: GraphQLString },
    branch: { type: GraphQLString },
    issuer: { type: GraphQLString },
    source: { type: GraphQLString },
    scratch: { type: GraphQLString },
    component: { type: GraphQLString },
  }),
});

const StateType = new GraphQLObjectType({
  name: 'StateType',
  fields: () => ({
    note: { type: GraphQLString },
    type: { type: GraphQLString },
    docs: { type: GraphQLString },
    state: { type: GraphQLString },
    stage: { type: GraphQLString },
    msg_id: { type: GraphQLString },
    reason: { type: GraphQLString },
    status: { type: GraphQLString },
    timestamp: { type: GraphQLInt },
    string: { type: GraphQLString },
    version: { type: GraphQLString },
    system: { type: StateSystemType },
    category: { type: GraphQLString },
    issue_url: { type: GraphQLString },
    namespace: { type: GraphQLString },
    thread_id: { type: GraphQLString },
    processed: { type: GraphQLBoolean },
    generated_at: { type: GraphQLString },
    label: { type: new GraphQLList(GraphQLString) },
    recipients: { type: new GraphQLList(GraphQLString) },
    ci: { type: StateCiType },
    run: { type: StateRunType },
    test: { type: StateTestType },
    error: { type: StateErrorType },
    origin: { type: StateOriginType },
    contact: { type: StateContactType },
    artifact: { type: StateArtifactType },
    pipeline: { type: StatePipelineType },
    xunit: {
      args: {
        msg_id: {
          type: new GraphQLList(GraphQLString),
          description: 'Show xunit only if its msg_id in this list.',
        },
      },
      type: GraphQLString,
      resolve(parentValue, args, context, info) {
        const { msg_id } = args;
        const { xunit: xunit_v1 = null, test: { xunit: xunit_v2 } = null } = {
          test: {},
          ...parentValue,
        };
        const xunit = _.compact([xunit_v1, xunit_v2])[0];
        if (_.isEmpty(xunit)) {
          return null;
        }
        if (!_.isEmpty(msg_id) && !_.includes(msg_id, parentValue.msg_id)) {
          /**
           * msg_id in args doesn't match
           */
          return null;
        }
        if (xunit.startsWith('http')) {
          /**
           * promise
           */
          return loadXunitFromUrl(xunit);
        }
        return xunit;
      },
    },
    test_case_name: {
      type: GraphQLString,
      resolve(parentValue, args, context, info) {
        const {
          type: v1_type,
          category: v1_category,
          namespace: v1_namespace,
        } = parentValue;
        if (v1_namespace && v1_type && v1_category) {
          return `${v1_namespace}.${v1_type}.${v1_category}`;
        }
        if (_.isEmpty(parentValue.test)) {
          return undefined;
        }
        const {
          type: v2_type,
          category: v2_category,
          namespace: v2_namespace,
        } = parentValue.test;
        if (v2_namespace && v2_type && v2_category) {
          return `${v2_namespace}.${v2_type}.${v2_category}`;
        }
        return undefined;
      },
    },
  }),
});

const loadXunitFromUrl = async (url: string) => {
  const config = {
    withCredentials: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Origin, Content-Type, X-Auth-Token',
    },
  };
  var response;
  try {
    response = await axios.get(url, config);
    const compressed = pako.deflate(Buffer.from(response.data, 'utf8'), {
      level: 1,
    });
    response = Buffer.from(compressed).toString('base64');
  } catch (responseError) {
    log('Cannot proccess %s. Error: %o', url, responseError);
    return;
  }
  return response;
};

const ArtifactCurrentStateType = new GraphQLObjectType({
  name: 'ArtifactCurrentStateType',
  fields: () => ({
    error: { type: new GraphQLList(StateType) },
    queued: { type: new GraphQLList(StateType) },
    waived: { type: new GraphQLList(StateType) },
    running: { type: new GraphQLList(StateType) },
    complete: { type: new GraphQLList(StateType) },
  }),
});

// const ArtifactStateStatusType = new GraphQLObjectType({
//     name: 'ArtifactStateStatusType',
//     fields: () => ({
//         size: { type: GraphQLInt },
//         info: { type: GraphQLInt },
//         failed: { type: GraphQLInt },
//         passed: { type: GraphQLInt },
//         unknown: { type: GraphQLInt },
//         not_applicable: { type: GraphQLInt },
//         needs_inspection: { type: GraphQLInt },
//     }),
// });

// const ArtifactCurrentStateLenghtsType = new GraphQLObjectType({
//     name: 'ArtifactCurrentStateLenghtsType',
//     fields: () => ({
//         error: { type: ArtifactStateStatusType },
//         queued: { type: ArtifactStateStatusType },
//         waived: { type: ArtifactStateStatusType },
//         running: { type: ArtifactStateStatusType },
//         complete: { type: ArtifactStateStatusType },
//     }),
// });

const nameFieldForType = (type: KnownTypes) => {
  const includes = _.includes(_.keys(known_types), type);
  if (!includes) {
    return 'unknown type';
  }
  return known_types[type];
};

const convertNsvcToNvr = (nsvc: string) => {
  const splited = nsvc.split(':');
  if (_.size(splited) !== 4) {
    console.error(`Encountered invalid NSVC ${nsvc}`);
    return null;
  }
  /**
   * Convert NSVC to Brew NVR
   */
  return `${splited[0]}-${splited[1].replace(/-/g, '_')}-${splited[2]}.${
    splited[3]
  }`;
};

class Payload {
  constructor(obj: any) {
    Object.assign(this, obj);
  }
}
class MBSBuild extends Payload {}
class RPMBuild extends Payload {}
class Compose extends Payload {}

export const ArtifactRPMBuildType = new GraphQLObjectType({
  name: 'ArtifactRPMBuildType',
  description: 'Defines artifact entry for RPM build.',
  fields: () => ({
    nvr: { type: GraphQLString },
    uid: { type: GraphQLString },
    branch: { type: GraphQLString },
    issuer: { type: GraphQLString },
    source: { type: GraphQLString },
    scratch: { type: GraphQLBoolean },
    component: { type: GraphQLString },
    comment_id: { type: GraphQLString },
    repository: { type: GraphQLString },
    commit_hash: { type: GraphQLString },
    dependencies: { type: GraphQLString },
    gate_tag_name: { type: GraphQLString },
  }),
  isTypeOf: (payload_value) => payload_value instanceof RPMBuild,
});

export const ArtifactComposeType = new GraphQLObjectType({
  name: 'ArtifactComposeType',
  description: 'Defines artifact entry for Compose.',
  fields: () => ({
    compose_type: { type: GraphQLString },
  }),
  isTypeOf: (payload_value) => payload_value instanceof Compose,
});

export const ArtifactMBSBuildType = new GraphQLObjectType({
  name: 'ArtifactMBSBuildType',
  description: 'Defines artifact entry for MBS build.',
  fields: () => ({
    uid: { type: GraphQLString },
    name: { type: GraphQLString },
    nsvc: { type: GraphQLString },
    stream: { type: GraphQLString },
    context: { type: GraphQLString },
    version: { type: GraphQLString },
  }),
  isTypeOf: (payload_value) => payload_value instanceof MBSBuild,
});

export const ArtifactPayloadType = new GraphQLUnionType({
  name: 'ArtifactPayloadType',
  types: [ArtifactRPMBuildType, ArtifactMBSBuildType, ArtifactComposeType],
});

export const ArtifactType = new GraphQLObjectType({
  name: 'ArtifactType',
  description: 'Defines artifact entry.',
  fields: () => ({
    _id: { type: GraphQLID },
    type: { type: GraphQLString },
    aid: { type: GraphQLString },
    payload: {
      type: ArtifactPayloadType,
      resolve(parentValue, args, context, info) {
        const { type } = parentValue;
        if (type === 'koji-build') {
          return new RPMBuild(parentValue.rpm_build);
        }
      },
    },
    states: { type: new GraphQLList(StateType) },
    current_state: { type: ArtifactCurrentStateType },
  }),
});

export const ArtifactsType = new GraphQLObjectType({
  name: 'ArtifactsType',
  fields: () => ({
    artifacts: { type: new GraphQLList(ArtifactType) },
    has_next: { type: GraphQLBoolean },
  }),
});
