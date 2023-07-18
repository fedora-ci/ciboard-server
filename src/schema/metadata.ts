/*
 * This file is part of ciboard-server

 * Copyright (c) 2022, 2023 Andrei Stepanov <astepano@redhat.com>
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
import * as graphql from 'graphql';
import debug from 'debug';
import util from 'util';
import { GraphQLJSON } from 'graphql-type-json';
import { GraphQLFieldConfig, GraphQLID } from 'graphql';

import printify from '../services/printify';
import { getcfg } from '../cfg';
import { UserSamlType } from './db_types';
import { MetadataModel } from '../services/db_interface';
import { assertMetadataIsValid } from '../services/validation_ajv';
import { getOpensearchClient, OpensearchClient } from '../services/db';
import { ApiResponse, RequestParams } from '@opensearch-project/opensearch/.';

const log = debug('osci:metadata_types');
const cfg = getcfg();

const { GraphQLInt, GraphQLString, GraphQLBoolean, GraphQLObjectType } =
  graphql;

/**
 * History management is not implemented in Opensearch. In MongoDB it history was in document.
 * In opensearch it is better to store history in different place.
 */
export const MetadataModHistory = new GraphQLObjectType({
  name: 'CISystemModHistory',
  fields: () => ({
    author: {
      type: GraphQLString,
      description: 'A user who made modification.',
    },
    time: {
      type: GraphQLString,
      description: 'Date encoded in ISO 8601 format.',
    },
  }),
});

const mkHistoryEntry = (user: UserSamlType) => {
  const allowedRWGroups = cfg.metadata.rw_groups.set;
  const rwGroups = _.intersection(user.Role, allowedRWGroups);
  return {
    time: new Date().toISOString(),
    author: user.displayName,
    rwGroups,
  };
};

export const MetadataRawType = new GraphQLObjectType({
  name: 'MetadataRawType',
  fields: () => ({
    _id: { type: GraphQLID, description: 'internal ID for CI-system ' },
    payload: { type: GraphQLJSON, description: 'Payload according to schema.' },
    priority: {
      type: GraphQLInt,
      description: 'Priority of this metadata.',
    },
    product_version: {
      type: GraphQLString,
      description: 'If present, metadata applies to specific product.',
    },
    _updated: {
      type: GraphQLString,
      description: 'When the document was updated.',
    },
    testcase_name: { type: GraphQLString, description: 'CI-system name' },
    testcase_name_is_regex: {
      type: graphql.GraphQLBoolean,
      description: 'testcase_name is encoded in regex JS regex',
    },
  }),
});

export const MetadataConsolidatedType = new GraphQLObjectType({
  name: 'MetadataConsolidatedType',
  fields: () => ({
    payload: { type: GraphQLJSON, description: 'Consolidated payload' },
  }),
});

export const AuthZMappingType = new GraphQLObjectType({
  name: 'AuthZMappingType',
  fields: () => ({
    can_edit_metadata: {
      type: GraphQLBoolean,
      description: 'If logged in user can edit metadata',
    },
  }),
});

export interface UpdateMetadataArgs {
  _id?: string;
  priority: number;
  payload?: object;
  product_version?: string;
  testcase_name?: string;
  testcase_name_is_regex?: boolean;
}

const makeDocumentBody = async (
  param: UpdateMetadataArgs,
): Promise<RequestParams.Index> => {
  const indexesPrefix = cfg.opensearch.indexes_prefix;
  const paramIndexName = `${indexesPrefix}metadata`;
  /* documentId can be undefined, in this case document will be created */
  const documentId = param._id;
  const documentBody: Partial<MetadataModel> = _.pick(
    _.omitBy(param, _.isNil),
    'payload',
    'priority',
    'testcase_name',
    'product_version',
    'testcase_name_is_regex',
  );
  const updated = new Date().toISOString();
  documentBody._updated = updated;
  await assertMetadataIsValid(documentBody);
  const document: RequestParams.Index = {
    id: documentId,
    body: documentBody,
    index: paramIndexName,
  };
  return document;
};

export const metadataUpdate: GraphQLFieldConfig<any, any> = {
  type: MetadataRawType,
  description: 'Update metadata for specific ci-system.',
  args: {
    _id: {
      type: GraphQLID,
      description:
        'CI-system personal ID, used in dashboard-DB. If empty, create a new entry for CI-system. If single _id -> remove entry.',
    },
    testcase_name: {
      type: GraphQLString,
      description:
        'ResultsDB testcase. Can be regex. Check https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions for reference.',
    },
    product_version: {
      type: GraphQLString,
      description:
        'Narrow scope of these metadata to specific product-version. Example: rhel-8',
    },
    testcase_name_is_regex: {
      type: GraphQLBoolean,
      description: 'testcase_name is regex.',
    },
    priority: {
      type: GraphQLInt,
      description: 'metadata priority',
    },
    payload: {
      type: GraphQLJSON,
      description: 'CI-system info.',
    },
  },
  async resolve(_parentValue, args, request) {
    const logref = _.compact([
      args._id,
      args.testcase_name,
      args.testcase_name_is_regex,
    ]).toString();
    const { user } = request;
    if (!user || !user.displayName) {
      const comment = util.format(
        'User is not logged, when updating metadata update for: %s',
        logref,
      );
      log(comment);
      // XXX return new Error(comment);
    }
    const allowedRWGroups = cfg.metadata.rw_groups.set;
    /*
     * Local devel: set `user` to:
     * fakeUser = { nameID: 'an', displayName: 'A N', Role: ['Employee'] } as UserSamlType,
     */
    const fakeUser = {
      nameID: 'an',
      displayName: 'A N',
      Role: ['Employee'],
    } as UserSamlType;
    const rwGroups = _.intersection(fakeUser.Role, allowedRWGroups);
    if (_.isEmpty(rwGroups)) {
      const comment = util.format(
        'User does not stay in any allowed RW group to update metadata: %s, %s.',
        allowedRWGroups,
        logref,
      );
      log(comment);
      return new Error(comment);
    }
    log(
      'User %s is granted to perform RW action. User is part of %s groups.',
      fakeUser.displayName,
      rwGroups,
    );
    let opensearchClient: OpensearchClient;
    try {
      opensearchClient = await getOpensearchClient();
      if (_.isUndefined(opensearchClient.client)) {
        throw new Error('Connection is not initialized');
      }
    } catch (err) {
      throw err;
    }
    const documentId = args._id;
    const deleteDocument = _.isEmpty(_.omit(args, ['_id'])) && documentId;
    if (deleteDocument) {
      const indexesPrefix = cfg.opensearch.indexes_prefix;
      const paramIndexName = `${indexesPrefix}metadata`;
      let result: ApiResponse = await opensearchClient.client.delete({
        index: paramIndexName,
        id: documentId,
      });
      return {};
    }
    const documentBody: RequestParams.Index = await makeDocumentBody(
      args as UpdateMetadataArgs,
    );
    let result: ApiResponse = await opensearchClient.client.index(documentBody);
    log(
      ' [i] query -> %s -> answer -> %s',
      printify(documentBody),
      printify(_.omit(result.body, ['hits.hits'])),
    );
    return documentBody.body;
  },
};

export const metadataConsolidated: GraphQLFieldConfig<any, any> = {
  args: {
    testcase_name: {
      type: new GraphQLNonNull(GraphQLString),
      description:
        'Exact testcase name. Example: osci.brew-build./plans/tier1-internal.functional',
    },
    product_version: {
      type: GraphQLString,
      description:
        /* product version == greenwave product_version */
        'Narrow metadata only for specific product version, including common metadata. Example: rhel-8. If not specified, show for all available products.',
    },
  },
  type: MetadataConsolidatedType,
  description: 'Returns consolidated metadata for specified testcase.',
  async resolve(_parentValue, args, _context, _info) {
    const { testcase_name, product_version } = args;
    //const col = await getCollection(Metadata);
    const testcaseName = {
      $cond: {
        if: { $eq: ['$testcase_name_is_regex', true] },
        then: {
          $regexMatch: {
            input: testcase_name,
            regex: '$testcase_name',
            options: 'i',
          },
        },
        else: { $eq: ['$testcase_name', testcase_name] },
      },
    };
    //const query: Filter<MetadataModel> = { $expr: testcaseName };
    /*
     * If `product_version` is specified, query for empty product as well and
     * merge the results (with the product-specific values taking precedence).
     */
    //if (_.has(args, 'product_version')) {
    //  query.product_version = { $in: [null, product_version] };
    // }
    // const payloads = await col.aggregate([
    //   { $match: query },
    /*
     * Prefer specific product version over general (empty), then lower priority
     * over higher priority number.
     */
    //   { $sort: { product_version: 1, priority: -1 } },
    /*
     * Pull the payload from within each result as we don't care about any of the
     * other data (id, priority, etc.) further on.
     */
    //   { $replaceWith: '$payload' },
    //  ]);
    // Merge matching metadata, respecting product version and priority order.
    // const mergedMetadata = _.mergeWith({}, ...payloads, customMerge);
    //  return { payload: mergedMetadata };
    return {};
  },
};
