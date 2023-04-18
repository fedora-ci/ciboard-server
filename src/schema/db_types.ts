/*
 * This file is part of ciboard-server

 * Copyright (c) 2021, 2022 Andrei Stepanov <astepano@redhat.com>
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
import GraphQLJSON from 'graphql-type-json';
import BigInt from 'graphql-bigint';
import { delegateToSchema } from '@graphql-tools/delegate';
import schema from './schema';
import { ObjectId } from 'mongodb';

const {
  GraphQLID,
  GraphQLInt,
  GraphQLList,
  GraphQLString,
  GraphQLBoolean,
  GraphQLObjectType,
} = graphql;

import { TKnownType, known_types } from '../cfg';
import {
  GreenwaveDecisionType,
  greenwave,
  getGreenwaveDecisionContext,
  getGreenwaveRules,
} from './greenwave_types';
import { ErrataToolAutomationStateType } from './eta_types';
import { MetadataConsolidatedType } from './metadata_types';
import { getOSVersionFromNvr } from '../services/misc';

const debug = require('debug');
const log = debug('osci:db_types');

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
    reason: { type: GraphQLString },
    issue_url: { type: GraphQLString },
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

/**
 * Artifact state - this is any kind of message, plus fields added during store phase
 */
export interface ArtifactState {
  /**
   * Block present for any kind of messages.
   */
  kai_state: KaiState;
  broker_msg_body: any;
}

export interface KaiState {
  /**
   * thread_id is copied thread_id from message or generated by KAI.
   */
  thread_id: string;
  /**
   * message_id is copied from message.
   * Used by KAI to check if this message already present in DB.
   * Mongodb has index for this field.
   */
  msg_id: string;
  /**
   * Version of schema broker message complays to.
   */
  version: string;
  /**
   * stage can be: 'build', 'dispatch', 'test', 'promote', etc....
   * derived from topic
   * stage (in standard called as `event`) is always the second item from the end of the topic
   * Examples:
   *
   * * pull-request.test.error -> test
   * * brew-build.promote.error -> promote
   **/
  stage: string;
  /**
   * state is always the latest part of the message
   * Examples:
   *
   *  * brew-build.promote.error -> error
   *  * brew-build.test.complete -> complete
   */
  state: string;
  /**
   * Derived from: generated_at
   * Example: 1616361381
   */
  timestamp: number;
  /**
   * processed
   */
  processed?: boolean;
  /**
   * origin
   */
  origin: {
    /**
     * Converted from pipeline message
     */
    creator: string;
    /**
     * kai
     */
    reason: string;
  };
  /**
   * Create, if possible, test case name.
   * The same name will have resultsdb:
   * https://pagure.io/fedora-ci/messages/blob/master/f/mappings/results/brew-build.test.complete.yaml#_5
   *
   *    name: "${body.test.namespace}.${body.test.type}.${body.test.category}"
   *
   * https://pagure.io/fedora-ci/messages/blob/master/f/schemas/test-common.yaml#_52
   *
   */
  test_case_name?: string;
}

const StateType = new GraphQLObjectType({
  name: 'StateType',
  fields: () => ({
    kai_state: { type: KaiStateType },
    broker_msg_body: {
      type: GraphQLJSON,
      description: 'all existing xunit entries are removed',
      resolve(parentValue) {
        const { broker_msg_body } = parentValue;
        return _.omit(broker_msg_body, ['xunit', 'test.xunit']);
      },
    },
    /** XXX: move this to independent query. Create index in DB. */
    broker_msg_xunit: {
      type: GraphQLString,
      args: {
        msg_id: {
          type: new GraphQLList(GraphQLString),
          description: 'Show xunit only if its msg_id in this list.',
        },
      },
      resolve(parentValue: ArtifactState, args) {
        const { msg_id } = args;
        const { xunit: xunit_v1 = null, test: { xunit: xunit_v2 } = null } = {
          test: {},
          ...parentValue.broker_msg_body,
        };
        const xunit = _.compact([xunit_v1, xunit_v2])[0];
        if (_.isEmpty(xunit)) {
          return null;
        }
        if (
          !_.isEmpty(msg_id) &&
          !_.includes(msg_id, parentValue.kai_state.msg_id)
        ) {
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
    custom_metadata: {
      description:
        'Custom metadata associated with the state provided by the CI system maintainer',
      type: MetadataConsolidatedType,
      async resolve(parentValue: ArtifactState, _args, context, info) {
        const testcase_name = parentValue.kai_state.test_case_name;
        // The metadata_consolidated query requires the test case name to be non-null.
        if (!testcase_name) return null;
        // Guess product version from the NVR.
        const { nvr, type } = parentValue.broker_msg_body.artifact;
        // Currently, only RPM and module builds are supported.
        if (!['brew-build', 'redhat-module'].includes(type)) {
          log(
            'Artifact type %s not supported for test metadata delegation',
            type,
          );
          return null;
        }
        const product_version = `rhel-${getOSVersionFromNvr(nvr, type)}`;

        log(
          'Delegating metadata query for state: testcase %s, product %s',
          testcase_name,
          product_version,
        );

        return await delegateToSchema({
          schema,
          operation: 'query',
          fieldName: 'metadata_consolidated',
          args: {
            testcase_name,
            product_version,
          },
          context,
          info,
        });
      },
    },
  }),
});

const KaiStateType = new GraphQLObjectType({
  name: 'KaiStateType',
  fields: () => ({
    stage: {
      type: GraphQLString,
      description: 'Example: build, dispatch, test, promote',
    },
    state: {
      type: GraphQLString,
      description: 'Example: complete, running, error',
    },
    msg_id: { type: GraphQLString },
    origin: { type: StateOriginType },
    version: { type: GraphQLString },
    thread_id: { type: GraphQLString },
    timestamp: { type: BigInt as graphql.GraphQLOutputType },
    test_case_name: { type: GraphQLString },
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

const nameFieldForType = (type: TKnownType) => {
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

export const ComponentComponentMappingType = new GraphQLObjectType({
  name: 'ComponentComponentMappingType',
  fields: () => ({
    component_name: { type: GraphQLString },
    product_id: { type: GraphQLInt },
    description: { type: GraphQLString },
    def_assignee: { type: GraphQLString },
    def_assignee_name: { type: GraphQLString },
    qa_contact: { type: GraphQLString },
    qa_contact_name: { type: GraphQLString },
    sst_team_name: { type: GraphQLString },
    _updated: { type: GraphQLString },
  }),
});

export const ArtifactType = new GraphQLObjectType({
  name: 'ArtifactType',
  description: 'Defines artifact entry.',
  fields: () => ({
    _id: { type: GraphQLID },
    type: { type: GraphQLString },
    aid: { type: GraphQLString },
    payload: {
      type: GraphQLJSON,
    },
    component_mapping: { type: ComponentComponentMappingType },
    states: {
      type: new GraphQLList(StateType),
      args: {
        onlyactual: {
          type: GraphQLBoolean,
          description: 'Show only actual states based on thread-id.',
          defaultValue: false,
        },
      },
      resolve(parentValue, args, context, info) {
        const { states } = parentValue;
        const { onlyactual } = args;
        if (!onlyactual) {
          return states;
        }
        /**
         * thread_id is mandatory field. It present in each state-entry.
         * Split all states in groups by thread_id
         */
        const states_for_same_thread = _.values(
          _.groupBy(states, 'kai_state.thread_id'),
        );
        /**
         * get the most recent state for each thread
         */
        const recent_for_each_thread = _.map(
          states_for_same_thread,
          _.flow(
            _.identity,
            _.partialRight(_.orderBy, 'kai_state.timestamp', 'desc'),
            _.first,
          ),
        );
        return recent_for_each_thread;
      },
    },
    greenwave_decision: {
      /**
       * Query greenwave status only for certain artifacts.
       *
       * 1) When artifact has gate_tag_name
       * 2) When artifact is redhat-container-image
       *
       * For other cases return emtpy answer
       */
      type: GreenwaveDecisionType,
      resolve(parentValue, args, context, info) {
        log(
          'Getting greenwave decision for: %s type: %s',
          parentValue.aid,
          parentValue.type,
        );
        const isScratch = _.get(parentValue, 'payload.scratch', true);
        if (isScratch) {
          return {};
        }
        const gate_tag_name: string | undefined =
          parentValue?.payload?.gate_tag_name;
        if (
          _.isEmpty(gate_tag_name) &&
          parentValue.type !== 'redhat-container-image'
        ) {
          return {};
        }
        var item = _.get(
          /* item: 'nvr', 'nsvc' */
          parentValue,
          nameFieldForType(parentValue.type),
        );
        if (parentValue.type === 'redhat-module') {
          /* nsvc -> nvr */
          item = convertNsvcToNvr(item);
        }
        const decision_context = getGreenwaveDecisionContext(parentValue);
        const rules = getGreenwaveRules(parentValue);
        const product_version = greenwave.decision.product_version(
          item,
          gate_tag_name,
          parentValue.type,
        );
        const subject = [
          {
            item,
            type: parentValue.type,
          },
        ];
        const greenwaveDecisionArgs = {
          decision_context,
          product_version,
          subject,
          rules,
        };
        // https://www.graphql-tools.com/docs/schema-delegation/
        return delegateToSchema({
          schema: schema,
          operation: 'query',
          fieldName: 'greenwave_decision',
          args: greenwaveDecisionArgs,
          context,
          info,
        });
      },
    },
    states_eta: {
      type: new GraphQLList(ErrataToolAutomationStateType),
    },
  }),
});

export const ArtifactsType = new GraphQLObjectType({
  name: 'ArtifactsType',
  fields: () => ({
    artifacts: { type: new GraphQLList(ArtifactType) },
    has_next: { type: GraphQLBoolean },
  }),
});

export interface UpdateMetadataArgs {
  _id?: string;
  product_version?: string;
  testcase_name?: string;
  testcase_name_is_regex?: boolean;
  priority: number;
  payload?: object;
}

export interface UserSamlType {
  /* astepano@ ... */
  nameID: string;
  /* Andrei Stepanov */
  displayName: string;
  /* ['splunk-misc-posix', 'osci', ...] */
  Role: [];
}
