/*
 * This file is part of ciboard-server

 * Copyright (c) 2023, 2024 Andrei Stepanov <astepano@redhat.com>
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
import {
  GraphQLInt,
  GraphQLList,
  GraphQLString,
  GraphQLNonNull,
  GraphQLBoolean,
  GraphQLObjectType,
  GraphQLFieldConfig,
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
  AChild,
  isAChildTestMsg,
  getTestcaseName,
  getTestMsgBody,
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
  atype: string | undefined;
  parentDocId: string | undefined;
  childrenType: string | undefined;
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
  //        "dynamic_templates": [
  //        {
  //          "preserve_number": {
  //            "match_pattern": "regex",
  //            "path_match": """^(taskId|buildId|mbsId)$""",
  //            "mapping": {
  //              "type": "keyword",
  //              "fields": {
  //                "number": {
  //                  "type": "long"
  //                }
  //              }
  //            }
  //          }
  //        },
  // https://www.elastic.co/guide/en/elasticsearch/reference/current/sort-search-results.html#_ignoring_unmapped_fields
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
        "taskId.number": {
          "order": "desc",
          "unmapped_type" : "long"
        },
        "mbsId.number": {
          "order": "desc",
          "unmapped_type" : "long"
        },
        "buildId.number": {
          "order": "desc",
          "unmapped_type" : "long"
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
    ignore_unavailable: true,
  };
  return requestParams;
};

export const makeRequestParamsArtifactChildren = (
  queryArgs: QueryArgsForArtifactChildren,
): RequestParams.Search => {
  const { parentDocId, childrenType, atype, from, size } = queryArgs;
  const paramFrom = _.isUndefined(from) ? 0 : JSON.stringify(from);
  const paramSize = _.isUndefined(size) ? 10 : JSON.stringify(size);
  const paramParentDocId = JSON.stringify(parentDocId);
  const paramIndexName = getIndexName(atype);
  const paramChildrenType = _.isUndefined(childrenType)
    ? undefined
    : JSON.stringify(childrenType);
  let requestBody;
  if (childrenType) {
    /**
     * Request based on child type
     */
    requestBody = `
      {
        "query": {
            "parent_id": {
                "type": ${paramChildrenType},
                "id": ${paramParentDocId}
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
                "values": [${paramParentDocId}]
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
    metadata: {
      description:
        'Custom metadata associated with the state provided by the CI system maintainer',
      type: MetadataConsolidatedType,
      async resolve(parentValue : AChild, _args, context, info) {
        const aChild = parentValue;
        if (!isAChildTestMsg(aChild)) {
            return null;
        }
        const testcaseName = getTestcaseName(aChild);
        // The metadata_consolidated query requires the test case name to be non-null.
        if (!testcaseName) return null;
        const brokerMsgBody = getTestMsgBody(aChild);
        // Guess product version from the NVR.
        const { nvr, type } = brokerMsgBody.artifact;
        // Currently, only RPM and module builds are supported.
        if (!['brew-build', 'redhat-module'].includes(type)) {
          log(
            'Artifact type %s not supported for test metadata delegation',
            type,
          );
          return null;
        }
        const productVersion = `rhel-${getOSVersionFromNvr(nvr, type)}`;
        log(
          'Delegating metadata query for state: testcase %s, product %s',
          testcaseName,
          productVersion,
        );
        return await delegateToSchema({
          schema,
          operation: 'query',
          fieldName: 'metadataConsolidated',
          args: {
            testcaseName,
            productVersion,
          },
          context,
          info,
        });
      },
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
    size: {
      type: GraphQLInt,
      description: 'Used for pagination',
    },
    from: {
      type: GraphQLInt,
      description: 'Used for pagination',
    },
    atype: {
      type: GraphQLString,
      description: 'Parent artifact type, used to select correct index',
    },
    onlyActual: {
      type: GraphQLBoolean,
      description: 'Show only the latest message for a test.',
    },
    parentDocId: {
      type: new GraphQLNonNull(GraphQLString),
      description: 'Parent document ID',
    },
    childrenType: {
      type: GraphQLString,
      description: 'Children type, if empty will return all known children',
    },
  },
  description: 'Returns a documents linked to parent document.',
  async resolve(_parentValue, args, _context, _info) {
    const queryArgs: QueryArgsForArtifactChildren = _.pick(args, [
      'from',
      'size',
      'atype',
      'parentDocId',
      'childrenType',
    ]);
    const { parentDocId, onlyActual } = args;
    log(' [i] get children documents for %s', parentDocId);
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
    if (!onlyActual) {
      return { hits, hits_info };
    }
    /**
     * thread_id is mandatory field. It present in each state-entry.
     * Split all states in groups by thread_id
     */
    const childrenWithSameThreadId = _.values(
      _.groupBy(hits, 'hit_source.threadId'),
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
        onlyActual: {
          type: GraphQLBoolean,
          description: 'Show only actual states based on thread-id.',
          defaultValue: false,
        },
        childrenType: {
          type: GraphQLString,
          description: 'Possible values: message',
          defaultValue: undefined,
        },
      },
      async resolve(parentValue, args, context, info) {
        const parentDocId = parentValue.hit_info._id;
        const atype = parentValue.hit_source.aType;
        const childrenType = args.childrenType ? args.childrenType : undefined;
        const { onlyActual } = args;
        const artifactChildrenArgs = {
          atype,
          size: 999,
          onlyActual,
          parentDocId,
          childrenType,
        };
        // https://www.graphql-tools.com/docs/schema-delegation/
        const reply = await delegateToSchema({
          info,
          args: artifactChildrenArgs,
          schema: schema,
          context,
          operation: 'query',
          fieldName: 'artifactChildren',
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
        // https://www.graphql-tools.com/docs/schema-delegation/
        return delegateToSchema({
          schema: schema,
          operation: 'query',
          fieldName: 'greenwaveDecision',
          args: greenwaveDecisionArgs,
          context,
          info,
        });
      },
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
