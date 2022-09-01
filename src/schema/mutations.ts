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
import util from 'util';
import axios from 'axios';
import debug from 'debug';
import * as graphql from 'graphql';
import { GraphQLID } from 'graphql';
import GraphQLJSON from 'graphql-type-json';
const {
  GraphQLInt,
  GraphQLString,
  GraphQLBoolean,
  GraphQLNonNull,
  GraphQLObjectType,
} = graphql;

import { MetadataRawType } from './metadata_types';
import { UserSamlType, UpdateMetadataArgs } from '../schema/db_types';
import { WaiverDBWaiverType } from './waiverdb_types';
import { axios_krb_waiverdb } from '../services/axios';
import { waiverdb_cfg, getcfg } from '../cfg';
import { getCollection, Metadata } from '../services/db';

const log = debug('osci:mutations');
const cfg = getcfg();

const mutation = new GraphQLObjectType({
  name: 'Mutation',
  fields: {
    metadata_update: {
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
      async resolve(_parentValue, payload, request) {
        const logref = _.compact([
          payload._id,
          payload.testcase_name,
          payload.testcase_name_is_regex,
        ]).toString();
        const { user } = request;
        if (!user || !user.displayName) {
          const comment = util.format(
            'User is not logged, when updating metadata update for: %s',
            logref,
          );
          log(comment);
          return new Error(comment);
        }
        const allowedRWGroups = cfg.metadata.rw_groups.set;
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
        const col = await getCollection(Metadata);
        const doc = await col.update(
          payload as UpdateMetadataArgs,
          user as UserSamlType,
          /* For local devel:
           * { nameID: 'an', displayName: 'A N', Role: [] } as UserSamlType,
           */
        );
        return doc;
      },
    },
    waiver_db_new: {
      type: WaiverDBWaiverType,
      args: {
        waived: { type: new GraphQLNonNull(GraphQLBoolean) },
        comment: { type: new GraphQLNonNull(GraphQLString) },
        testcase: { type: new GraphQLNonNull(GraphQLString) },
        subject_type: {
          type: new GraphQLNonNull(GraphQLString),
        },
        product_version: {
          type: new GraphQLNonNull(GraphQLString),
        },
        subject_identifier: {
          type: new GraphQLNonNull(GraphQLString),
        },
      },
      async resolve(parentValue, payload, request) {
        let response;
        const { user } = request;
        if (!user || !user.displayName) {
          const comment = util.format(
            'User is not logged, when sending a waiver for: %s.',
            payload.subject_identifier,
          );
          log(comment);
          return new Error(comment);
        }
        try {
          const comment = util.format(
            '%s: %s',
            user.displayName,
            payload.comment,
          );
          /**
           * https://docs.pagure.org/waiverdb/admin-guide.html#waive-permission
           * Kerberos dashboard user is superuser:
           * https://gitlab.../ansible-playbooks/waiverdb-playbooks/-/merge_requests/54
           */
          const username = user.nameID.split('@')[0];
          log('Send waiver for user: %s', username);
          response = axios_krb_waiverdb({
            method: 'post',
            url: waiverdb_cfg?.waivers.api_url.pathname,
            data: { ...payload, comment, username },
          });
        } catch (error) {
          return error;
        }
        /**
         * .then() - only on success. On errors will be returned complete response object with {errors, data}
         */
        return response.then(
          (x) => x.data,
          (x) => {
            if (axios.isAxiosError(x) && x.response?.data.message) {
              x.message = `${x.message} (${x.response.data.message})`;
            }
            return x;
          },
        );
      },
    },
  },
});

export default mutation;
