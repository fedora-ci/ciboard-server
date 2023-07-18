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

import * as graphql from 'graphql';
import util from 'util';
import debug from 'debug';
import { GraphQLFieldConfig, GraphQLNonNull } from 'graphql';
import { axios_krb_waiverdb } from '../services/axios';
import { waiverdb_cfg } from '../cfg';
import axios from 'axios';

const log = debug('osci:waiverdb');

const {
  GraphQLObjectType,
  GraphQLList,
  GraphQLString,
  GraphQLBoolean,
  GraphQLInt,
} = graphql;

export const WaiverDBInfoType = new GraphQLObjectType({
  name: 'WaiverDBInfoType',
  fields: () => ({
    auth_method: { type: GraphQLString },
    version: { type: GraphQLString },
  }),
});

export const WaiverDBConfigPermissionType = new GraphQLObjectType({
  name: 'WaiverDBConfigPermissionType',
  fields: () => ({
    testcase_regex: { type: GraphQLString },
    users: { type: new GraphQLList(GraphQLString) },
    groups: { type: new GraphQLList(GraphQLString) },
  }),
});

const WaiverDBPermissionItemType = new GraphQLObjectType({
  name: 'WaiverDBPermissionsItemType',
  fields: () => ({
    name: { type: GraphQLString },
    description: { type: GraphQLString },
    maintainers: { type: new GraphQLList(GraphQLString) },
    testcases: { type: new GraphQLList(GraphQLString) },
    users: { type: new GraphQLList(GraphQLString) },
    groups: { type: new GraphQLList(GraphQLString) },
  }),
});

export const WaiverDBPermissionsType = new GraphQLList(
  WaiverDBPermissionItemType,
);

/**
 * https://waiverdb/api/v1.0/waivers/
 */
export const WaiverDBWaiversType = new GraphQLObjectType({
  name: 'WaiverDBWaiversType',
  fields: () => ({
    page_url_prev: { type: GraphQLString },
    page_url_next: { type: GraphQLString },
    page_url_last: { type: GraphQLString },
    page_url_first: { type: GraphQLString },
    waivers: { type: new GraphQLList(WaiverDBWaiverType) },
  }),
});

export const WaiverDBSubjectType = new GraphQLObjectType({
  name: 'WaiverDBSubjectType',
  fields: () => ({
    type: { type: GraphQLString },
    item: { type: GraphQLString },
  }),
});

export const WaiverDBWaiverType = new GraphQLObjectType({
  name: 'WaiverDBWaiverType',
  fields: () => ({
    id: { type: GraphQLInt },
    waived: { type: GraphQLBoolean },
    comment: { type: GraphQLString },
    username: { type: GraphQLString },
    testcase: { type: GraphQLString },
    timestamp: { type: GraphQLString },
    proxied_by: { type: GraphQLString },
    subject_type: { type: GraphQLString },
    subject: { type: WaiverDBSubjectType },
    product_version: { type: GraphQLString },
    subject_identifier: { type: GraphQLString },
  }),
});

export const waiverNew: GraphQLFieldConfig<any, any> = {
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
      const comment = util.format('%s: %s', user.displayName, payload.comment);
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
};
