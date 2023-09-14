/*
 * This file is part of ciboard-server

 * Copyright (c) 2023 Andrei Stepanov <astepano@redhat.com>
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

import _, { uniqueId } from 'lodash';
import * as graphql from 'graphql';
import pako from 'pako';
import axios from 'axios';
import debug from 'debug';
import BigInt from 'graphql-bigint';
import {
  GraphQLInt,
  GraphQLList,
  GraphQLString,
  GraphQLNonNull,
  GraphQLBoolean,
  GraphQLObjectType,
  GraphQLFieldConfig,
  GraphQLInputObjectType,
} from 'graphql';
import GraphQLJSON from 'graphql-type-json';
import { delegateToSchema } from '@graphql-tools/delegate';
import { ApiResponse, RequestParams } from '@opensearch-project/opensearch/.';

import schema from './schema';
import { printify } from '../services/printify';
import {
  canBeGated,
  getIndexName,
  ArtifactHitT,
  isArtifactRedHatModule,
} from '../services/db_interface';
import { TKnownType, known_types, getcfg } from '../cfg';
import { OpensearchClient, getOpensearchClient } from '../services/db';
import {
  greenwave,
  getGreenwaveRules,
  GreenwaveDecisionType,
  getGreenwaveDecisionContext,
} from './greenwave_types';
import { getOSVersionFromNvr } from '../services/misc';
import { MetadataConsolidatedType } from './metadata';
import { ErrataToolAutomationStateType } from './eta_types';

const log = debug('osci:schema/artifacts');
const cfg = getcfg();

export type QueryOptions = {
  sortBy: string | undefined;
  artTypes: string[] | undefined;
  newerThen: string | undefined;
  queryString: string | undefined;
  paginationSize: number | undefined;
  paginationFrom: number | undefined;
};

export type QueryArgsForArtifactChildren = {
  from: number | undefined;
  size: number | undefined;
  parent_doc_id: string | undefined;
  child_type: string | undefined;
  atype: string | undefined;
};

const ComponentComponentMappingType = new GraphQLObjectType({
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

export const makeRequestParamsArtifacts = (
  queryOptions: QueryOptions,
): RequestParams.Search => {
  const {
    sortBy,
    artTypes,
    newerThen,
    queryString,
    paginationSize,
    paginationFrom,
  } = queryOptions;
  const paramFrom = _.isUndefined(paginationFrom)
    ? 0
    : JSON.stringify(paginationFrom);
  const paramSize = _.isUndefined(paginationSize)
    ? 10
    : JSON.stringify(paginationSize);
  const paramQueryString =
    _.isUndefined(queryString) || _.isEmpty(queryString)
      ? '"*"'
      : JSON.stringify(queryString);
  const paramIndexNames = _.map(artTypes, (artType) => getIndexName(artType));
  const paramSortBy = _.isUndefined(sortBy)
    ? '"taskId.number"'
    : JSON.stringify(sortBy);
  const requestBody = `
  {
    "explain": false,
    "query": {
      "bool": {
        "filter": {
          "has_child": {
            "type": "message",
            "query": {
              "match_all": {}
            }
          }
        },
        "must": [
          {
            "query_string": {
              "query": ${paramQueryString},
              "lenient": true,
              "default_operator": "and",
              "analyze_wildcard": true,
              "allow_leading_wildcard": true,
              "type" : "cross_fields"
            }
          }
        ]
      }
    },
    "sort": [
      {
        "_score": {
          "order": "desc"
        }
      },
      {
        ${paramSortBy}: {
          "order": "desc"
        }
      }
    ],
    "size": ${paramSize},
    "from": ${paramFrom}
  }
  `;
  const requestParams: RequestParams.Search = {
    body: requestBody,
    index: paramIndexNames,
  };
  return requestParams;
};

export const makeRequestParamsArtifactChildren = (
  queryArgs: QueryArgsForArtifactChildren,
): RequestParams.Search => {
  const { parent_doc_id, child_type, atype, from, size } = queryArgs;
  const paramFrom = _.isUndefined(from) ? 0 : JSON.stringify(from);
  const paramSize = _.isUndefined(size) ? 10 : JSON.stringify(size);
  const parentDocId = JSON.stringify(parent_doc_id);
  const paramIndexName = getIndexName(atype);
  const childType = _.isUndefined(size)
    ? undefined
    : JSON.stringify(child_type);
  let requestBody;
  if (childType) {
    /**
     * Request based on child type
     */
    requestBody = `
      {
        "query": {
            "parent_id": {
                "type": ${childType},
                "id": ${parentDocId}
            }
        },
        "size": ${paramSize},
        "from": ${paramFrom}
      }
    `;
  } else {
    /**
     * Request for all children types
     */
    requestBody = `
      {
        "query": {
          "has_parent": {
            "parent_type": "artifact",
            "query": {
              "ids": {
                "values": [${parentDocId}]
              }
            }
          }
        },
        "size": ${paramSize},
        "from": ${paramFrom}
      }
    `;
  }
  const requestParams: RequestParams.Search = {
    body: requestBody,
    index: paramIndexName,
  };
  return requestParams;
};

export const ArtifactChildrenHit = new GraphQLObjectType({
  name: 'ArtifactChildrenHit',
  fields: () => ({
    hit_source: {
      type: GraphQLJSON,
      description: 'db-document',
    },
    hit_info: {
      type: GraphQLJSON,
      description: 'info about db-document',
    },
  }),
});

export const ArtifactChildren = new GraphQLObjectType({
  name: 'ArtifactChildren',
  fields: () => ({
    hits: { type: new GraphQLList(ArtifactChildrenHit) },
    hits_info: {
      type: GraphQLJSON,
      description: 'information about opensearch-query',
    },
  }),
});

export const artifactChildren: GraphQLFieldConfig<any, any> = {
  type: ArtifactChildren,
  args: {
    parent_doc_id: {
      type: new GraphQLNonNull(GraphQLString),
      description: 'Parent document ID',
    },
    atype: {
      type: GraphQLString,
      description: 'Parent artifact type, used to select correct index',
    },
    child_type: {
      type: GraphQLString,
      description: 'Child type, if empty will return all known children',
    },
    onlyactual: {
      type: GraphQLBoolean,
      description: 'Show only the latest message for a test.',
    },
    from: {
      type: GraphQLInt,
      description: 'Used for pagination',
    },
    size: {
      type: GraphQLInt,
      description: 'Used for pagination',
    },
  },
  description: 'Returns a documents linked to parent document.',
  async resolve(_parentValue, args, _context, _info) {
    const queryArgs: QueryArgsForArtifactChildren = _.pick(args, [
      'from',
      'size',
      'atype',
      'child_type',
      'parent_doc_id',
    ]);
    const { parent_doc_id, onlyactual } = args;
    log(' [i] get children documents for %s', parent_doc_id);
    let opensearchClient: OpensearchClient;
    try {
      opensearchClient = await getOpensearchClient();
      if (_.isUndefined(opensearchClient.client)) {
        throw new Error('Connection is not initialized');
      }
    } catch (err) {
      throw err;
    }
    const requestParams: RequestParams.Search =
      makeRequestParamsArtifactChildren(queryArgs);
    log(' [i] run request: %s', printify(requestParams));
    let result: ApiResponse;
    try {
      result = await opensearchClient.client.search(requestParams);
    } catch (err) {
      console.error(
        'Failed to run opensearch request: %o. Ignoring.: ',
        requestParams,
        _.toString(err),
      );
      if (_.isError(err)) {
        return;
      } else {
        throw err;
      }
    }
    log(
      ' [i] query -> %s -> answer -> %s',
      printify(requestParams),
      printify(_.omit(result.body, ['hits.hits'])),
    );
    /** transform Opensearch reply to ArtifactsType */
    const hitsItems = _.get(result, 'body.hits.hits', []);
    const hits = _.map(hitsItems, (hit) => ({
      hit_source: _.get(hit, '_source'),
      hit_info: _.omit(hit, '_source'),
    }));
    const hitsData = _.get(result, 'body.hits', {});
    const hits_info = _.omit(hitsData, ['hits']);
    if (!onlyactual) {
      return { hits, hits_info };
    }
    /**
     * thread_id is mandatory field. It present in each state-entry.
     * Split all states in groups by thread_id
     */
    const childrenWithSameThreadId = _.values(
      _.groupBy(hits, 'hit_source.searchable.thread_id'),
    );
    /**
     * get the most recent state for each thread
     */
    const recentChildrenForEachThreadId = _.map(
      childrenWithSameThreadId,
      _.flow(
        _.identity,
        _.partialRight(_.orderBy, 'hit_info._id', 'desc'),
        _.first,
      ),
    );
    log(
      ' [i] total states: %s, reduced: %s',
      hits.length,
      recentChildrenForEachThreadId.length,
    );
    return { hits: recentChildrenForEachThreadId, hits_info };
  },
};

export const ArtifactsType = new GraphQLObjectType({
  name: 'ArtifactsType',
  fields: () => ({
    hits: { type: new GraphQLList(ArtifactHitType) },
    hits_info: {
      type: GraphQLJSON,
      description: 'information about opensearch-query',
    },
  }),
});

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

const StateOriginType = new GraphQLObjectType({
  name: 'StateOriginType',
  fields: () => ({
    reason: { type: GraphQLString },
    creator: { type: GraphQLString },
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

export const ArtifactHitType = new GraphQLObjectType({
  name: 'ArtifactHitType',
  description: 'Artifact entry.',
  fields: () => ({
    hit_source: {
      type: GraphQLJSON,
      description: 'db-document',
    },
    hit_info: {
      type: GraphQLJSON,
      description: 'info about db-document',
    },
    component_mapping: { type: ComponentComponentMappingType },
    children: {
      type: ArtifactChildren,
      args: {
        onlyactual: {
          type: GraphQLBoolean,
          description: 'Show only actual states based on thread-id.',
          defaultValue: false,
        },
        child_type: {
          type: GraphQLString,
          description: 'Possible values: message',
          defaultValue: false,
        },
      },
      async resolve(parentValue, args, context, info) {
        const parent_doc_id = parentValue.hit_info._id;
        const atype = parentValue.hit_source.searchable.type;
        const child_type = args.child_type ? args.child_type : undefined;
        const { onlyactual } = args;
        const artifactChildrenArgs = {
          atype,
          size: 999,
          onlyactual,
          child_type,
          parent_doc_id,
        };
        // https://www.graphql-tools.com/docs/schema-delegation/
        const reply = await delegateToSchema({
          info,
          args: artifactChildrenArgs,
          schema: schema,
          context,
          operation: 'query',
          fieldName: 'artifact_children',
        });

        return reply;
      },
    },
    greenwaveDecision: {
      /**
       * Query greenwave status only for certain artifacts.
       *
       * 1) When artifact has gate_tag_name
       * 2) When artifact is redhat-container-image
       *
       * For other cases return emtpy answer
       */
      type: GreenwaveDecisionType,
      resolve(parentValue: ArtifactHitT, _args, context, info) {
        const { hit_source: hitSource, hit_info: hitInfo } = parentValue;
        if (!canBeGated(hitSource)) {
          log('Cannot be gated %O', hitInfo);
          return;
        }
        const { gateTag, aType } = hitSource;
        log('Getting greenwave decision for: %s', aType);
        let gatedItem = _.get(
          /* item: 'nvr', 'nsvc' */
          hitSource,
          nameFieldForType(aType),
        );
        if (isArtifactRedHatModule(hitSource)) {
          /* nsvc -> nvr */
          gatedItem = convertNsvcToNvr(gatedItem);
        }
        const decision_context = getGreenwaveDecisionContext(hitSource);
        const rules = getGreenwaveRules(hitSource);
        const product_version = greenwave.decision.product_version(
          gatedItem,
          gateTag,
          aType,
        );
        const subject = [
          {
            item: gatedItem,
            type: aType,
          },
        ];
        const greenwaveDecisionArgs = {
          decision_context,
          product_version,
          subject,
          rules,
        };
        console.log('XXXX =>>>>>>>>>>>>>>', greenwaveDecisionArgs);
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

export const getArtifacts: GraphQLFieldConfig<any, any> = {
  type: ArtifactsType,
  args: {
    sortBy: {
      type: GraphQLString,
      description: 'Starting point of the results. Used for pagination.',
    },
    artTypes: {
      type: new GraphQLList(GraphQLString),
      description: 'Artifact types. If omitted, then search in all indexes.',
    },
    newerThen: {
      type: GraphQLString,
      description: 'Show entries no older then specified timestamp.',
    },
    queryString: {
      type: GraphQLString,
      description: 'Query string.',
    },
    paginationSize: {
      type: GraphQLInt,
      description: 'Number of results to return per page.',
    },
    paginationFrom: {
      type: GraphQLInt,
      description: 'Starting point of the results.',
    },
  },
  async resolve(_parentValue, args) {
    const argsDefault = {
      paginationSize: cfg.opensearch.size,
    };
    const queryOptions: QueryOptions = _.defaultsDeep(args, argsDefault);
    let opensearchClient: OpensearchClient;
    opensearchClient = await getOpensearchClient();
    if (_.isUndefined(opensearchClient.client)) {
      throw new Error('Connection is not initialized');
    }
    const requestParams: RequestParams.Search =
      makeRequestParamsArtifacts(queryOptions);
    log(' [i] run request: %s', printify(requestParams));
    let result: ApiResponse;
    try {
      result = await opensearchClient.client.search(requestParams);
    } catch (err) {
      console.error(
        'Failed to run opensearch request: %o. Ignoring.: ',
        requestParams,
        _.toString(err),
      );
      if (_.isError(err)) {
        return;
      } else {
        throw err;
      }
    }
    log(
      ' [i] query -> %s -> answer -> %s',
      printify(requestParams),
      printify(_.omit(result.body, ['hits.hits'])),
    );
    /** transform Opensearch reply to ArtifactsType */
    const hitsItems = _.get(result, 'body.hits.hits', []);
    const hits = _.map(hitsItems, (hit) => ({
      hit_source: _.get(hit, '_source'),
      hit_info: _.omit(hit, '_source'),
    }));
    const hitsData = _.get(result, 'body.hits', {});
    const hits_info = _.omit(hitsData, ['hits']);
    const reply = { hits, hits_info };
    return reply;
  },
};

export const SstHitType = new GraphQLObjectType({
  name: 'SstHitType',
  description: 'Artifact entry.',
  fields: () => ({
    hit_source: {
      type: GraphQLJSON,
      description: 'db-document',
    },
    hit_info: {
      type: GraphQLJSON,
      description: 'info about db-document',
    },
    components: {
      type: new GraphQLList(GraphQLJSON),
      description: 'Components',
    },
  }),
});

export const SstInfoType = new GraphQLObjectType({
  name: 'SstInfoType',
  fields: () => ({
    hits: { type: new GraphQLList(SstHitType) },
    hits_info: {
      type: GraphQLJSON,
      description: 'information about opensearch-query',
    },
  }),
});

export type QueryOptionsSst = {
  productId: string | undefined;
  sstName: string | undefined;
};

export const makeSearchBodySst = (
  queryOptions: QueryOptionsSst,
): RequestParams.Search => {
  const { productId, sstName } = queryOptions;
  const paramSstName = JSON.stringify(sstName);
  const paramProductId = JSON.stringify(productId);
  const indexesPrefix = cfg.opensearch.indexes_prefix;
  const paramIndexName = `${indexesPrefix}components`;
  const requestBodyString = `
  {
    "size": 1000,
    "explain": false,
    "query": {
      "bool": {
        "filter": {
          "has_child": {
            "type": "component",
            "query": {
              "match_all": {}
            },
            "inner_hits": {
              "_source": true
            }
          }
        },
        "must": []
      }
    },
    "sort": [
      {
        "_score": {
          "order": "desc"
        }
      },
      {
        "sst.productId.number": {
          "order": "desc"
        }
      }
    ]
  }
  `;
  const mustProductIdString = `
    {
      "term": {
        "sst.productId": {
          "value": ${paramProductId}
        }
      }
    }
  `;
  const mustSstNameString = `
    {
      "query_string": {
        "query": ${paramSstName},
        "fields": ["sst.sstName"]
      }
    }
  `;
  const requestBody = JSON.parse(requestBodyString);
  let i = 0;
  if (productId) {
    _.set(
      requestBody,
      `query.bool.must[${i}]`,
      JSON.parse(mustProductIdString),
    );
    i++;
  }
  if (sstName) {
    _.set(requestBody, `query.bool.must[${i}]`, JSON.parse(mustSstNameString));
  }
  const requestParams: RequestParams.Search = {
    body: JSON.stringify(requestBody),
    index: paramIndexName,
  };
  return requestParams;
};

export const querySstList: GraphQLFieldConfig<any, any> = {
  type: SstInfoType,
  description: 'List know SST teams.',
  args: {
    productId: {
      type: GraphQLInt,
      description:
        'Return results only for specified product id. RHEL 9: 604, RHEL: 8: 370',
    },
    sstName: {
      type: GraphQLString,
      description: 'part of sst name',
    },
  },
  async resolve(_parentValue, args, _context, _info) {
    const { productId, sstName } = args;
    let opensearchClient: OpensearchClient;
    try {
      opensearchClient = await getOpensearchClient();
      if (_.isUndefined(opensearchClient.client)) {
        throw new Error('Connection is not initialized');
      }
    } catch (err) {
      throw err;
    }
    const searchBody: RequestParams.Search = makeSearchBodySst({
      sstName,
      productId,
    });
    let result: ApiResponse = await opensearchClient.client.search(searchBody);
    log(
      ' [i] query -> %s -> answer -> %s',
      printify(searchBody),
      printify(_.omit(result.body, ['hits.hits'])),
    );
    /** transform Opensearch reply */
    const hitsItems = _.get(result, 'body.hits.hits', []);
    const hits = _.map(hitsItems, (hit) => ({
      hit_source: _.get(hit, '_source'),
      hit_info: _.omit(hit, ['_source', 'inner_hits']),
      components: _.get(hit, 'inner_hits.component.hits.hits'),
    }));
    const hitsData = _.get(result, 'body.hits', {});
    const hits_info = _.omit(hitsData, ['hits']);
    const reply = { hits, hits_info };
    return reply;
  },
};
