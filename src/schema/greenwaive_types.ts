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
import debug from 'debug';
import { getOSVersionFromNvr } from '../services/misc';

const log = debug('osci:greenwaive_types');
const {
  GraphQLObjectType,
  GraphQLList,
  GraphQLString,
  GraphQLBoolean,
  GraphQLInt,
} = graphql;

export const GreenWaiveInfoType = new GraphQLObjectType({
  name: 'GreenWaiveInfoType',
  fields: () => ({
    version: { type: GraphQLString },
  }),
});

export const GreenWaiveSatisfiedReqType = new GraphQLObjectType({
  name: 'GreenWaiveSatisfiedReqType',
  fields: () => ({
    type: { type: GraphQLString },
    result_id: { type: GraphQLInt },
    testcase: { type: GraphQLString },
    subject_type: { type: GraphQLString },
    subject_identifier: { type: GraphQLString },
  }),
});

const GreenWaiveUnSatisfiedReqItemType = new GraphQLObjectType({
  name: 'GreenWaiveUnSatisfiedReqItemType',
  fields: () => ({
    item: { type: GraphQLString },
    type: { type: GraphQLString },
  }),
});

export const GreenWaiveUnSatisfiedReqType = new GraphQLObjectType({
  name: 'GreenWaiveUnSatisfiedReqType',
  fields: () => ({
    item: { type: GreenWaiveUnSatisfiedReqItemType },
    scenario: { type: GraphQLString },
    subject_identifier: { type: GraphQLString },
    subject_type: { type: GraphQLString },
    testcase: { type: GraphQLString },
    type: { type: GraphQLString },
  }),
});

export const GreenWaiveResultDataType = new GraphQLObjectType({
  name: 'GreenWaiveResultDataType',
  fields: () => ({
    brew_task_id: {
      type: new GraphQLList(GraphQLString),
    },
    category: {
      type: new GraphQLList(GraphQLString),
    },
    ci_email: {
      type: new GraphQLList(GraphQLString),
    },
    ci_irc: {
      type: new GraphQLList(GraphQLString),
    },
    ci_name: {
      type: new GraphQLList(GraphQLString),
    },
    ci_team: {
      type: new GraphQLList(GraphQLString),
    },
    ci_url: {
      type: new GraphQLList(GraphQLString),
    },
    component: {
      type: new GraphQLList(GraphQLString),
    },
    issuer: {
      type: new GraphQLList(GraphQLString),
    },
    item: {
      type: new GraphQLList(GraphQLString),
    },
    log: {
      type: new GraphQLList(GraphQLString),
    },
    publisher_id: {
      type: new GraphQLList(GraphQLString),
    },
    rebuild: {
      type: new GraphQLList(GraphQLString),
    },
    recipients: {
      type: new GraphQLList(GraphQLString),
    },
    scratch: {
      type: new GraphQLList(GraphQLString),
    },
    system_os: {
      type: new GraphQLList(GraphQLString),
    },
    system_provider: {
      type: new GraphQLList(GraphQLString),
    },
    type: {
      type: new GraphQLList(GraphQLString),
    },
  }),
});

export const GreenWaiveResultTestcaseType = new GraphQLObjectType({
  name: 'GreenWaiveResultTestcaseType',
  fields: () => ({
    href: { type: GraphQLString },
    name: { type: GraphQLString },
    ref_url: { type: GraphQLString },
  }),
});

export const GreenWaiveResultType = new GraphQLObjectType({
  name: 'GreenWaiveResultType',
  fields: () => ({
    id: { type: GraphQLInt },
    href: { type: GraphQLString },
    note: { type: GraphQLString },
    outcome: { type: GraphQLString },
    ref_url: { type: GraphQLString },
    submit_time: { type: GraphQLString },
    data: { type: GreenWaiveResultDataType },
    groups: {
      type: new GraphQLList(GraphQLString),
    },
    testcase: { type: GreenWaiveResultTestcaseType },
  }),
});

export const GreenWaiveWaiverSubjectType = new GraphQLObjectType({
  name: 'GreenWaiveWaiverSubjectType',
  fields: () => ({
    item: { type: GraphQLString },
    type: { type: GraphQLString },
  }),
});

export const GreenWaiveWaiverRuleType = new GraphQLObjectType({
  name: 'GreenWaiveWaiverRuleType',
  fields: () => ({
    type: { type: GraphQLString },
    test_case_name: { type: GraphQLString },
  }),
});

export const GreenWaiveWaiverType = new GraphQLObjectType({
  name: 'GreenWaiveWaiverType',
  fields: () => ({
    comment: { type: GraphQLString },
    id: { type: GraphQLInt },
    product_version: { type: GraphQLString },
    proxied_by: { type: GraphQLString },
    subject: { type: GreenWaiveWaiverSubjectType },
    subject_identifier: { type: GraphQLString },
    subject_type: { type: GraphQLString },
    testcase: { type: GraphQLString },
    timestamp: { type: GraphQLString },
    username: { type: GraphQLString },
    waived: { type: GraphQLBoolean },
  }),
});

export const GreenWaiveDecisionType = new GraphQLObjectType({
  name: 'GreenWaiveDecisionType',
  fields: () => ({
    policies_satisfied: { type: GraphQLBoolean },
    summary: { type: GraphQLString },
    satisfied_requirements: {
      type: new GraphQLList(GreenWaiveSatisfiedReqType),
    },
    unsatisfied_requirements: {
      type: new GraphQLList(GreenWaiveUnSatisfiedReqType),
    },
    results: {
      type: new GraphQLList(GreenWaiveResultType),
    },
    waivers: {
      type: new GraphQLList(GreenWaiveWaiverType),
    },
  }),
});

export const GreenWaiveSubjectTypeType = new GraphQLObjectType({
  name: 'GreenWaiveSubjectTypeType',
  description: 'Return loaded subject type entry',
  fields: () => ({
    aliases: {
      type: new GraphQLList(GraphQLString),
    },
    id: {
      type: GraphQLString,
    },
    ignore_missing_policy: {
      type: GraphQLBoolean,
    },
    is_koji_build: {
      type: GraphQLBoolean,
    },
    is_nvr: {
      type: GraphQLBoolean,
    },
    item_key: {
      type: GraphQLString,
    },
    product_version: {
      type: GraphQLString,
    },
    result_queries: {
      type: new GraphQLList(
        new GraphQLObjectType({
          name: 'GreenWaiveSubjectTypeItemResultQueriesType',
          fields: {
            item_key: { type: GraphQLString },
            keys: {
              type: new GraphQLObjectType({
                name: 'GreenWaiveSubjectTypeItemResultQueriesTypeType',
                fields: {
                  type: { type: GraphQLString },
                },
              }),
            },
          },
        })
      ),
    },
    supports_remote_rule: {
      type: GraphQLBoolean,
    },
    item_dict: {
      type: new GraphQLObjectType({
        name: 'GreenWaiveSubjectTypeItemDictType',
        fields: { item_key: { type: GraphQLString } },
      }),
    },
  }),
});

export const GreenWaiveSubjectTypesType = new GraphQLObjectType({
  name: 'GreenWaiveSubjectTypesType',
  description: 'Returns all currently loaded subject_types',
  fields: () => ({
    subject_types: {
      type: new GraphQLList(GreenWaiveSubjectTypeType),
    },
  }),
});

export const GreenWaivePolicyType = new GraphQLObjectType({
  name: 'GreenWaivePolicyType',
  description: 'Returns policy entry.',
  fields: () => ({
    id: { type: GraphQLString },
    subject_type: { type: GraphQLString },
    relevance_key: { type: GraphQLString },
    relevance_value: { type: GraphQLString },
    decision_context: { type: GraphQLString },
    blacklist: {
      type: new GraphQLList(GraphQLString),
    },
    excluded_packages: {
      type: new GraphQLList(GraphQLString),
    },
    packages: {
      type: new GraphQLList(GraphQLString),
    },
    product_versions: {
      type: new GraphQLList(GraphQLString),
    },
    rules: {
      type: new GraphQLList(
        new GraphQLObjectType({
          name: 'GreenWaivePolicyRuleType',
          fields: {
            rule: { type: GraphQLString },
            scenario: { type: GraphQLString },
            test_case_name: { type: GraphQLString },
          },
        })
      ),
    },
  }),
});

export const GreenWaivePoliciesType = new GraphQLObjectType({
  name: 'GreenWaivePoliciesType',
  description: 'Returns all currently loaded policies.',
  fields: () => ({
    policies: {
      type: new GraphQLList(GreenWaivePolicyType),
    },
  }),
});

export const greenwave = {
  decision: {
    context: {
      'brew-build': 'osci_compose_gate',
      'redhat-module': 'osci_compose_gate_modules',
      'redhat-container': 'cvp_default',
    },
    product_version: (nvr: string, artifactType: string) => {
      const rhel_version = getOSVersionFromNvr(nvr, artifactType);
      switch (artifactType) {
        case 'brew-build':
          return `rhel-${rhel_version}`;
        case 'redhat-module':
          return `rhel-${rhel_version}`;
        case 'redhat-container':
          return 'cvp';
        default:
          log('Cannot construct product verstion for', nvr, artifactType);
          return 'unknown_product_version';
      }
    },
  },
};
