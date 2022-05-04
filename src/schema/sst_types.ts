/*
 * This file is part of ciboard-server

 * Copyright (c) 2022 Andrei Stepanov <astepano@redhat.com>
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

const graphql = require('graphql');
const { GraphQLList, GraphQLObjectType, GraphQLString } = graphql;

export type SSTInfoType = {
  name: string;
  display_name: string;
  releases: { name: string; url: string }[];
};

const SSTItemType = new GraphQLObjectType({
  name: 'SSTItemType',
  fields: () => ({
    name: { type: GraphQLString },
    display_name: { type: GraphQLString },
    releases: { type: new GraphQLList(GraphQLString) },
  }),
});

export const SSTListType = new GraphQLList(SSTItemType);
