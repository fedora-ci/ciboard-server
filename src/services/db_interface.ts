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
import debug from 'debug';

import { getcfg } from '../cfg';

const log = debug('osci:services/db_interface');
const cfg = getcfg();


export const atype_to_hub_map = {
  'koji-build': 'fedoraproject',
  'koji-build-cs': 'centos-stream',
};

export const getIndexName = (aType: string | undefined): string => {
  /**
   * Based on query:
   * GET _cat/indices/dev-*?v=true&s=index
   */
  const indexesPrefix = cfg.opensearch.indexes_prefix;
  let indexName;
  if (aType === 'brew-build') {
    indexName = 'redhat-rpm';
  } else if (aType === 'redhat-module') {
    indexName = 'redhat-module';
  } else if (aType === 'koji-build-cs') {
    indexName = 'centos-rpm';
  } else if (aType === 'koji-build') {
    indexName = 'fedora-rpm';
  } else if (aType === 'productmd-compose') {
    indexName = 'redhat-compose';
  } else if (aType === 'redhat-container-image') {
    indexName = 'redhat-container-image';
  } else if (aType === 'copr-build') {
    indexName = 'fedora-copr';
  } else if (aType === 'fedora-module') {
    indexName = 'fedora-module';
  }
  if (indexName) {
    return `${indexesPrefix}${indexName}`;
  }
  if (aType) {
    throw new Error(`[E] Cannot get index name for artifact type: ${aType}`);
  }
  return `${indexesPrefix}redhat-*,${indexesPrefix}fedora-*,${indexesPrefix}centos-*`;
};



export interface MetadataModel {
  /* internal id for ci-system entry */
  // XXX _id: ObjectId;
  _id: any;
  /**
   * Reqiured. MongoDB provides no out-of-the-box concurrency controls. For supporting concurrency is using a document version
   */
  _version: number;
  /* Updated at: iso 8601 string. */
  _updated: string;
  /* Tracks who made contributions to this testcase. */
  _update_history: { time: string; author: string }[];
  /*
   * ResultsDB testcase. Adresses specific CI-system.
   * A CI or other testing system that would like to discover, stage and invoke tests for a test subject.
   * Takes priority over `testcase_name_regex`
   */
  testcase_name?: string;
  /*
   * ResultsDB testcase regex.
   * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions
   */
  testcase_name_is_regex?: boolean;
  /* metadata product-version */
  product_version: string;
  /* metadata priority */
  priority: number;
  /* Payload according to schema file. */
  payload: any;
}


export interface SearchableRpm {
  /** 0ad-0.0.23b-13.fc33 */
  nvr: string;
  /** Example: copr-build */
  aType: ArtifactTypes;
  /** owner of the build */
  issuer: string;
  /** task id */
  taskId: string;
  /**
   * git://pkgs.devel.redhat.com/rpms/navilu-fonts?#937e7b088e82736a62d0b21cbb0f2e1299400b2e
   * Source can be unknown in some cases, such as in messages from Errata Automation.
   */
  source?: string;
  scratch?: boolean;
  /**
   * Scratch has only taskId
   */
  buildId?: string;
  /**
   * Gating tag. Example: rhel-8.1.0-gate
   */
  gateTag?: string;
  /** name from .spec file */
  component: string;
  brokerMsgIdGateTag?: string;
}

export type TSearchable =
  /** Rpm */
  | (SearchableRpm | SearchableTestRpm | SearchableEtaRpm)
  /** Mbs */
  | (SearchableMbs | SearchableTestMbs)
  /** Compose */
  | (SearchableCompose | SearchableTestCompose)
  /** Container */
  | (SearchableContainerImage | SearchableTestContainerImage)
  /** Pull-request */
  | SearchableDistGitPR;

export type TSearchableGated = { gateTag: string } & (
  | /** Rpm */
  SearchableRpm
  /** Mbs */
  | SearchableMbs
  /** Compose */
  | SearchableCompose
  /** Container */
  | SearchableContainerImage
);

export interface SearchableTestRpm extends SearchableRpm, SearchableTest {}

export interface SearchableEtaRpm extends SearchableRpm {
  brokerTopic: string;
  brokerMsgId: string;
  etaCiRunUrl: string;
  etaCiRunOutcome: string;
  etaCiRunExplanation: string;
}

export interface SearchableMbs {
  nvr: string;
  nsvc: string;
  /** Example: copr-build */
  aType: ArtifactTypes;
  mbsId: string;
  issuer: string;
  source?: string;
  scratch?: boolean;
  modName: string;
  gateTag?: string;
  modStream: string;
  modVersion: string;
  modContext: string;
  brokerMsgIdGateTag?: string;
}

export interface SearchableTestMbs extends SearchableMbs, SearchableTest {}

interface SearchableTest {
  /**
   * thread_id is copied thread_id from message or generated by KAI.
   */
  threadId: string;
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
  testCaseName?: string;
  /**
   * stage can be: 'build', 'dispatch', 'test', 'promote', etc....
   * derived from topic
   * stage (in standard called as `event`) is always the second item from the end of the topic
   * Examples:
   *
   * * pull-request.test.error -> test
   * * brew-build.promote.error -> promote
   **/
  testStage: string;
  /**
   * state is always the latest part of the message
   * Examples:
   *
   *  * brew-build.promote.error -> error
   *  * brew-build.test.complete -> complete
   */
  testState: string;
  /** Broker message id */
  brokerMsgId: string;
  /** Broker topic */
  brokerTopic: string;
}

export interface SearchableCompose {
  aType: ArtifactTypes;
  composeId: string;
  /** nightly */
  composeType: string;
  composeReleaseType?: string;
}

export interface SearchableTestCompose
  extends SearchableCompose,
    SearchableTest {}

export interface SearchableContainerImage {
  aType: ArtifactTypes;
  /*
   * https://pagure.io/fedora-ci/messages/blob/master/f/schemas/redhat-container-image.yaml
   */
  /** mirror-registry-container-v1.2.8-3 */
  nvr: string;
  /** task id */
  taskId: number;
  /** owner of the build */
  issuer: string;
  /** name from nvr */
  component: string;
  /** true or false or */
  scratch: boolean;
  /**
   * git://pkgs.devel.redhat.com/rpms/navilu-fonts?#937e7b088e82736a62d0b21cbb0f2e1299400b2e
   */
  source?: string;
  /*
   * Brew build ID of container
   */
  buildId?: number;
  /*
   * A digest that uniquely identifies the image within a repository.
   * Example: sha256:67dad89757a55bfdfabec8abd0e22f8c7c12a1856514726470228063ed86593b
   */
  contId: string;
  contTag?: string;
  contName?: string;
  contFullNames: string[];
  contNamespace?: string;
  contRegistryUrl?: string;
  /*
   * Entries come from: VirtualTopic.eng.brew.build.complete
   * https://datagrepper.engineering.redhat.com/raw?topic=/topic/VirtualTopic.eng.brew.build.complete&delta=86400&contains=container_build
   */
  osbsSubtypes?: string[];
  brokerMsgIdBuildComplete?: string;
}

export interface SearchableTestContainerImage
  extends SearchableContainerImage,
    SearchableTest {}

export interface SearchableDistGitPR {
  uid: string;
  issuer: string;
  commentId: string;
  repository: string;
  commitHash: string;
}

export type ArtifactTypes =
  /**
   * Builds from https://koji.fedoraproject.org/
   */
  | 'koji-build'
  /**
   * Builds from https://copr.fedorainfracloud.org/
   */
  | 'copr-build'
  /**
   * Builds from https://brewweb.engineering.redhat.com/
   */
  | 'brew-build'
  /**
   * PR from https://src.osci.redhat.com/
   */
  | 'dist-git-pr'
  /**
   * MBS builds from https://mbs.engineering.redhat.com/
   */
  | 'redhat-module'
  | 'fedora-module'
  /**
   * Composes produced by http://odcs.engineering.redhat.com/
   */
  | 'productmd-compose'
  /**
   * Builds from https://kojihub.stream.centos.org/koji/
   */
  | 'koji-build-cs'
  /*
   * Containers produced by https://brewweb.engineering.redhat.com/
   */
  | 'redhat-container-image';

/**
 * TypeScript guards
 */
export function isArtifactBrewBuild(
  artifact: TSearchable,
): artifact is SearchableRpm {
  const aType = _.get(artifact, 'aType');
  return aType === 'brew-build';
}
export function isArtifactRedHatModule(
  artifact: TSearchable,
): artifact is SearchableMbs {
  const aType = _.get(artifact, 'aType');
  return aType === 'redhat-module';
}
export function isArtifactCompose(
  artifact: TSearchable,
): artifact is SearchableCompose {
  const aType = _.get(artifact, 'aType');
  return aType === 'productmd-compose';
}
export function isArtifactRedHatContainerImage(
  artifact: TSearchable,
): artifact is SearchableContainerImage {
  const aType = _.get(artifact, 'aType');
  return aType === 'redhat-container-image';
}

export const canBeGated = (
  artifact: TSearchable,
): artifact is TSearchableGated => {
  if (
    isArtifactBrewBuild(artifact) ||
    isArtifactRedHatModule(artifact) ||
    isArtifactRedHatContainerImage(artifact)
  ) {
    const gateTag = _.get(artifact, 'gateTag');
    const isScratch = _.get(artifact, 'scratch');
    return !_.isEmpty(gateTag) && !isScratch;
  }

  return false;
};

export interface ArtifactHitT {
  hit_info: THitInfo;
  hit_source: TSearchable;
}

export interface AChild {
  hit_info: THitInfo;
  hit_source: any;
}

export function isAChildTestMsg(
  aChild: AChild | undefined,
): boolean {
  const msgStageName = _.get(aChild, 'hit_source.msgStage');
  if (msgStageName === 'test') {
      return true;
  }
  return false;
}

export const getTestMsgBody = (aChild: AChild): any => {
  return _.get(aChild, 'hit_source.rawData.message.brokerMsgBody')!;
};

function isMsgNew(
  msgBody: any,
): boolean {
  return (
      msgBody.version.startsWith('0.2.') ||
      msgBody.version.startsWith('1.')
  );
}

function isMsgOld(
  msgBody: any,
): boolean {
  return msgBody.version.startsWith('0.1.');
}

export const getTestcaseName = (aChild: AChild): string => {
  let testCaseName = 'unknonwn testcase name';
  if (isAChildTestMsg(aChild)) {
      const { hit_source } = aChild;
      const { testCaseName: tcn } = hit_source;
      const brokerMsgBody = getTestMsgBody(aChild);
      if (tcn) {
          testCaseName = tcn;
      }
      if (brokerMsgBody && _.isEmpty(testCaseName)) {
          if (isMsgOld(brokerMsgBody)) {
              const { category, namespace, type } = brokerMsgBody;
              if (category && namespace && type)
                  testCaseName = `${namespace}.${type}.${category}`;
          }
          if (isMsgNew(brokerMsgBody)) {
              const { category, namespace, type } = brokerMsgBody.test;
              if (category && namespace && type)
                  testCaseName = `${namespace}.${type}.${category}`;
          }
      }
  }
  if (_.isUndefined(testCaseName)) {
      log('Could not identify testcase name in child: %o', aChild);
  }
  return testCaseName;
};

export interface THitInfo {}
