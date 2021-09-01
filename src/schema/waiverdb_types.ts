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

export const WaiverDBConfigType = new GraphQLObjectType({
  name: 'WaiverDBConfigType',
  fields: () => ({
    superusers: { type: new GraphQLList(GraphQLString) },
    permission_mapping: {
      type: new GraphQLList(WaiverDBConfigPermissionType),
    },
  }),
});

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
