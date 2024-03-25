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
import util from 'util';
import debug from 'debug';
import {
  GraphQLID,
  GraphQLInt,
  GraphQLList,
  GraphQLString,
  GraphQLBoolean,
  GraphQLObjectType,
  GraphQLFieldConfig,
} from 'graphql';
import * as graphql from 'graphql';
import { GraphQLJSON } from 'graphql-type-json';
import { ApiResponse, RequestParams } from '@opensearch-project/opensearch/.';

import { getcfg } from '../cfg';
import printify from '../services/printify';
import { UserSamlType } from './db_types';
import { MetadataModel } from '../services/db_interface';
import { assertMetadataIsValid } from '../services/validation_ajv';
import { getOpensearchClient, OpensearchClient } from '../services/db';

const log = debug('osci:metadata');
const cfg = getcfg();

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
    productVersion: {
      type: GraphQLString,
      description: 'If present, metadata applies to specific product.',
    },
    _updated: {
      type: GraphQLString,
      description: 'When the document was updated.',
    },
    testcaseName: { type: GraphQLString, description: 'CI-system name' },
    testcaseNameIsRegex: {
      type: graphql.GraphQLBoolean,
      description: 'testcaseName is encoded in regex JS regex',
    },
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
  productVersion?: string;
  testcaseName?: string;
  testcaseNameIsRegex?: boolean;
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
    'testcaseName',
    'productVersion',
    'testcaseNameIsRegex',
  );
  const updated = new Date().toISOString();
  documentBody._updated = updated;
  await assertMetadataIsValid(documentBody);
  const document: RequestParams.Index = {
    id: documentId,
    body: documentBody,
    index: paramIndexName,
    refresh: 'wait_for',
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
    testcaseName: {
      type: GraphQLString,
      description:
        'ResultsDB testcase. Can be regex. Check https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions for reference.',
    },
    productVersion: {
      type: GraphQLString,
      description:
        'Narrow scope of these metadata to specific product-version. Example: rhel-8',
    },
    testcaseNameIsRegex: {
      type: GraphQLBoolean,
      description: 'testcaseName is regex.',
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
      args.testcaseName,
      args.testcaseNameIsRegex,
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
    const rwGroups = _.intersection(user.Role, allowedRWGroups);
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
      user.displayName,
      rwGroups,
    );
    let opensearchClient: OpensearchClient;
    opensearchClient = await getOpensearchClient();
    if (_.isUndefined(opensearchClient.client)) {
      throw new Error('Connection is not initialized');
    }
    const documentId = args._id;
    const deleteDocument = _.isEmpty(_.omit(args, ['_id'])) && documentId;
    if (deleteDocument) {
      const indexesPrefix = cfg.opensearch.indexes_prefix;
      const paramIndexName = `${indexesPrefix}metadata`;
      let result: ApiResponse = await opensearchClient.client.delete({
        index: paramIndexName,
        id: documentId,
        // refreshes shards to make the operation visible to searching
        refresh: true,
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

const makeSearchBodyMetadata = (
  _id: string | undefined,
): RequestParams.Search => {
  const indexesPrefix = cfg.opensearch.indexes_prefix;
  const paramIndexName = `${indexesPrefix}metadata`;
  const paramId = JSON.stringify(_id);
  const requestBodyStringAll = `
  {
    "query": {
      "match_all": {}
    }
  }
  `;
  const requestBodyStringId = `
  {
    "query": {
      "term": {
        "_id": ${paramId}
      }
    }
  }
  `;
  const requestBodyString = _id ? requestBodyStringId : requestBodyStringAll;
  const requestParams: RequestParams.Search = {
    body: requestBodyString,
    index: paramIndexName,
  };
  return requestParams;
};

const getAllKnownMetadata = async () : Promise<ApiResponse> => {
    let opensearchClient: OpensearchClient;
    opensearchClient = await getOpensearchClient();
    if (_.isUndefined(opensearchClient.client)) {
      throw new Error('Connection is not initialized');
    }
    const searchBody: RequestParams.Search = makeSearchBodyMetadata(undefined);
    let result: ApiResponse = await opensearchClient.client.search(searchBody);
    log(
      ' [i] query -> %s -> answer -> %s',
      printify(searchBody),
      printify(_.omit(result.body, ['hits.hits'])),
    );
    return  result;
}

const getAllKnownMetadataMemoized = _.memoize(getAllKnownMetadata)

let lastExecutionTime = 0;
const delayDuration = 4000; // 4 seconds
const getAllKnownMetadata4SecondsCached = async () => {
  const currentTime = Date.now();
  if (currentTime - lastExecutionTime >= delayDuration) {
    // If more than 4 seconds have passed, purge cache
    getAllKnownMetadataMemoized.cache.clear?.apply(this);
    lastExecutionTime = currentTime;
  }
  return await getAllKnownMetadataMemoized();
};

export const metadataRaw: GraphQLFieldConfig<any, any> = {
  type: new GraphQLList(MetadataRawType),
  description: 'Returns a list of known raw metadata.',
  args: {
    _id: {
      type: GraphQLString,
      description: 'Fetch only metadata for entry with ID',
    },
  },
  async resolve(_parentValue, args, _context, _info) {
    const { _id } = args;
    let opensearchClient: OpensearchClient;
    opensearchClient = await getOpensearchClient();
    if (_.isUndefined(opensearchClient.client)) {
      throw new Error('Connection is not initialized');
    }
    const searchBody: RequestParams.Search = makeSearchBodyMetadata(_id);
    let result: ApiResponse = await opensearchClient.client.search(searchBody);
    log(
      ' [i] query -> %s -> answer -> %s',
      printify(searchBody),
      printify(_.omit(result.body, ['hits.hits'])),
    );
    const hitsItems = _.get(result, 'body.hits.hits', []);
    const entries = _.map(hitsItems, _.partial(_.get, _, '_source'));
    const ids = _.map(hitsItems, _.partial(_.get, _, '_id'));
    const metadata = _.zipWith(entries, ids, (metadata, _id) =>
      _.assign(metadata, { _id }),
    );
    console.log(metadata);
    return metadata;
  },
};

export const queryAuthzMapping: GraphQLFieldConfig<any, any> = {
  type: AuthZMappingType,
  description: 'Returns an object of allowed actions for user.',
  async resolve(_parentValue, _args, context, _info) {
    const { user } = context;
    const authz = { can_edit_metadata: false };
    if (!user || !user.displayName) {
      return authz;
    }
    const allowedRWGroups = cfg.metadata.rw_groups.set;
    const rwGroups = _.intersection(user.Role, allowedRWGroups);
    if (!_.isEmpty(rwGroups)) {
      authz.can_edit_metadata = true;
    }
    return authz;
  },
};
