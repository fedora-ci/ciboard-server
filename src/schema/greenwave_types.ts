/*
 * This file is part of ciboard-server

 * Copyright (c) 2021, 2022, 2023 Andrei Stepanov <astepano@redhat.com>
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
import axios from 'axios';
import debug from 'debug';
const { GraphQLList, GraphQLString, GraphQLBoolean, GraphQLObjectType } =
  graphql;
import { greenwave_cfg } from '../cfg';

import { GraphQLJSON } from 'graphql-type-json';
import { getOSVersionFromNvr, getOSVersionFromTag } from '../services/misc';
import {
  TSearchable,
  isArtifactBrewBuild,
  isArtifactRedHatContainerImage,
  isArtifactRedHatModule,
} from '../services/db_interface';
import { GraphQLFieldConfig, GraphQLInputObjectType } from 'graphql';

const log = debug('osci:greenwave_types');

export const GreenwaveInfoType = new GraphQLObjectType({
  name: 'GreenwaveInfoType',
  fields: () => ({
    version: { type: GraphQLString },
  }),
});

export const GreenwaveDecisionType = new GraphQLObjectType({
  name: 'GreenwaveDecisionType',
  fields: () => ({
    policies_satisfied: { type: GraphQLBoolean },
    summary: { type: GraphQLString },
    satisfied_requirements: {
      type: new GraphQLList(GraphQLJSON),
    },
    unsatisfied_requirements: {
      type: new GraphQLList(GraphQLJSON),
    },
    results: {
      type: new GraphQLList(GraphQLJSON),
    },
    waivers: {
      type: new GraphQLList(GraphQLJSON),
    },
  }),
});

export const GreenwaveSubjectTypesType = new GraphQLObjectType({
  name: 'GreenWaiveSubjectTypesType',
  description: 'Returns all currently loaded subject_types',
  fields: () => ({
    subject_types: {
      type: new GraphQLList(GreenwaveSubjectTypeType),
    },
  }),
});

export const GreenwaveSubjectTypeType = new GraphQLObjectType({
  name: 'GreenwaveSubjectTypeType',
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
          name: 'GreenwaveSubjectTypeItemResultQueriesType',
          fields: {
            item_key: { type: GraphQLString },
            keys: {
              type: new GraphQLObjectType({
                name: 'GreenwaveSubjectTypeItemResultQueriesTypeType',
                fields: {
                  type: { type: GraphQLString },
                },
              }),
            },
          },
        }),
      ),
    },
    supports_remote_rule: {
      type: GraphQLBoolean,
    },
    item_dict: {
      type: new GraphQLObjectType({
        name: 'GreenwaveSubjectTypeItemDictType',
        fields: { item_key: { type: GraphQLString } },
      }),
    },
  }),
});

export const GreenwavePolicyType = new GraphQLObjectType({
  name: 'GreenwavePolicyType',
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
          name: 'GreenwavePolicyRuleType',
          fields: {
            rule: { type: GraphQLString },
            scenario: { type: GraphQLString },
            test_case_name: { type: GraphQLString },
          },
        }),
      ),
    },
  }),
});

export const GreenwavePoliciesType = new GraphQLObjectType({
  name: 'GreenwavePoliciesType',
  description: 'Returns all currently loaded policies.',
  fields: () => ({
    policies: {
      type: new GraphQLList(GreenwavePolicyType),
    },
  }),
});

export const getGreenwaveDecisionContext = (
  artifact: TSearchable,
): GreenwaveContext | undefined => {
  if (isArtifactBrewBuild(artifact)) {
    return 'osci_compose_gate';
  } else if (isArtifactRedHatModule(artifact)) {
    return 'osci_compose_gate_modules';
  }
};

type GreenwaveRuleType = {
  type: string;
  test_case_name?: string;
};

export const getGreenwaveRules = (
  artifact: TSearchable,
): GreenwaveRuleType[] => {
  if (isArtifactRedHatContainerImage(artifact)) {
    /*
     * https://issues.redhat.com/browse/RHELWF-7827
     * https://code.engineering.redhat.com/gerrit/plugins/gitiles/errata-rails/+/refs/heads/master/lib/brew/import/builds.rb#57
     * https://code.engineering.redhat.com/gerrit/plugins/gitiles/errata-rails/+/refs/heads/master/config/initializers/settings.rb#524
     */
    /** XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX */
    if (
      _.includes((artifact as any).payload.osbs_subtypes, 'operator_bundle')
    ) {
      return [
        {
          type: 'PassingTestCaseRule',
          test_case_name:
            'cvp.redhat.detailed.operator-metadata-preparation-bundle-image',
        },
        {
          type: 'PassingTestCaseRule',
          test_case_name:
            'cvp.redhat.detailed.operator-metadata-linting-bundle-image',
        },
        {
          type: 'PassingTestCaseRule',
          test_case_name:
            'cvp.redhat.detailed.operator-packagename-uniqueness-bundle-image',
        },
        {
          type: 'PassingTestCaseRule',
          test_case_name:
            'cvp.redhat.detailed.operator-catalog-initialization-bundle-image',
        },
        {
          type: 'PassingTestCaseRule',
          test_case_name:
            'cvp.redhat.detailed.operator-valid-subscriptions-bundle-image',
        },
        {
          type: 'RemoteRule',
        },
        {
          type: 'PassingTestCaseRule',
          test_case_name:
            'cvp.redhat.detailed.operator-version-format-bundle-image',
        },
        {
          type: 'PassingTestCaseRule',
          test_case_name:
            'cvp.redhat.detailed.operator-olm-deployment-bundle-image',
        },
      ];
    } else {
      return [
        {
          type: 'PassingTestCaseRule',
          test_case_name: 'cvp.rhproduct.default.sanity',
        },
        {
          type: 'PassingTestCaseRule',
          test_case_name: 'cvp.rhproduct.default.functional',
        },
        {
          type: 'RemoteRule',
        },
      ];
    }
  }
  return [];
};

export type GreenwaveContext =
  | 'osci_compose_gate'
  | 'osci_compose_gate_modules'
  | 'cvp_default'
  | 'cvp_redhat_operator_default';

export const greenwave = {
  decision: {
    product_version: (
      nvr: string,
      gate_tag_name: string | undefined,
      artifactType: string,
    ) => {
      const rhel_version_from_tag = getOSVersionFromTag(gate_tag_name);
      const rhel_version_from_nvr = getOSVersionFromNvr(nvr, artifactType);
      const rhel_version = _.chain([
        rhel_version_from_tag,
        rhel_version_from_nvr,
      ])
        .compact()
        .first()
        .value();
      switch (artifactType) {
        case 'brew-build':
          return `rhel-${rhel_version}`;
        case 'redhat-module':
          return `rhel-${rhel_version}`;
        case 'redhat-container-image':
          return 'cvp';
        default:
          log('Cannot construct product verstion for', nvr, artifactType);
          return 'unknown_product_version';
      }
    },
  },
};

export const queryGreenwaveInfo: GraphQLFieldConfig<any, any> = {
  type: GreenwaveInfoType,
  resolve() {
    if (!greenwave_cfg?.url) {
      throw new Error('Greenwave is not configured.');
    }
    return axios
      .get(greenwave_cfg.about.api_url.toString())
      .then((x) => x.data);
  },
};

export const queryGreenwaveSubjectTypes: GraphQLFieldConfig<any, any> = {
  type: GreenwaveSubjectTypesType,
  resolve() {
    if (!greenwave_cfg?.url) {
      throw new Error('Greenwave is not configured.');
    }
    return axios
      .get(greenwave_cfg.subject_types.api_url.toString())
      .then((x) => x.data);
  },
};

export const queryGreenwavePolicies: GraphQLFieldConfig<any, any> = {
  type: GreenwavePoliciesType,
  resolve() {
    if (!greenwave_cfg?.url) {
      throw new Error('Greenwave is not configured.');
    }
    return axios
      .get(greenwave_cfg.policies.api_url.toString())
      .then((x) => x.data);
  },
};

const GreenwaveWaiverRuleInputType = new GraphQLInputObjectType({
  name: 'GreenwaveWaiverRuleInputType',
  fields: () => ({
    type: { type: GraphQLString },
    test_case_name: { type: GraphQLString },
  }),
});

const GreenwaveWaiverSubjectInputType = new GraphQLInputObjectType({
  name: 'GreenwaveWaiverSubjectInputType',
  fields: () => ({
    item: { type: GraphQLString },
    type: { type: GraphQLString },
  }),
});

export const queryGreenwaveDecision: GraphQLFieldConfig<any, any> = {
  type: GreenwaveDecisionType,
  args: {
    when: {
      type: GraphQLString,
      description:
        'A date (or datetime) in ISO8601 format. Greenwave will take a decision considering only results and waivers until that point in time. Use this to get previous decision disregarding a new test result or waiver.',
    },
    rules: {
      type: new GraphQLList(GreenwaveWaiverRuleInputType),
      description:
        'A list of dictionaries containing the ‘type’ and ‘test_case_name’ of an individual rule used to specify on-demand policy. For example, [{“type”:”PassingTestCaseRule”, “test_case_name”:”dist.abicheck”}, {“type”:”RemoteRule”}]. Do not use this parameter along with decision_context.',
    },
    subject: {
      type: new GraphQLList(GreenwaveWaiverSubjectInputType),
      description:
        'A list of items about which the caller is requesting a decision used for querying ResultsDB and WaiverDB. Each item contains one or more key-value pairs of ‘data’ key in ResultsDB API. For example, [{“type”: “koji_build”, “item”: “xscreensaver-5.37-3.fc27”}]. Use this for requesting decisions on multiple subjects at once. If used subject_type and subject_identifier are ignored.',
    },
    subject_type: {
      type: GraphQLString,
      description:
        'The type of software artefact we are making a decision about, for example koji_build.',
    },
    ignore_result: {
      type: new GraphQLList(GraphQLString),
      description:
        'A list of result ids that will be ignored when making the decision.',
    },
    ignore_waiver: {
      type: new GraphQLList(GraphQLString),
      description:
        'A list of waiver ids that will be ignored when making the decision.',
    },
    product_version: {
      type: GraphQLString,
      description:
        'The product version string used for querying WaiverDB. Example: fedora-30',
    },
    decision_context: {
      type: GraphQLString,
      description:
        'The decision context string, identified by a free-form string label. It is to be named through coordination between policy author and calling application, for example bodhi_update_push_stable. Do not use this parameter with rules.',
    },
    subject_identifier: {
      type: GraphQLString,
      description:
        'A string identifying the software artefact we are making a decision about. The meaning of the identifier depends on the subject type.',
    },
  },
  resolve(_parentValue, args) {
    if (!greenwave_cfg?.url) {
      throw new Error('Greenwave is not configured.');
    }
    const postQuery = { ...args };
    postQuery.verbose = true;
    log('Query greenwave for decision: %o', postQuery);
    return axios
      .post(greenwave_cfg.decision.api_url.toString(), postQuery)
      .then((x) => x.data);
  },
};
