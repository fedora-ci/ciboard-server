/*
 * This file is part of ciboard

 * Copyright (c) 2024 Andrei Stepanov <astepano@redhat.com>
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

type MsgStageName =
    | 'test'
    | 'build'
    | 'dispatch'
    | 'dispatcher'
    | 'greenwave';
/**
 * https://pagure.io/fedora-ci/messages/blob/master/f/schemas/test-complete.yaml#_14
 *
 * complete is expanded to:
 *
 * - passed
 * - failed
 * - info
 * - needs_inspection
 * - not_applicable
 */
type TestMsgStateName =
    | 'info'
    | 'passed'
    | 'failed'
    | 'not_applicable'
    | 'needs_inspection'
    | MsgStateName;
const KnownMsgStates: MsgStateName[] = [
    'error',
    'queued',
    'running',
    'complete',
];
type MsgStateName = 'error' | 'queued' | 'running' | 'complete';
type AChild = AChildMsg;
type AChildMsg = AChildSchemaMsg;
type AChildSchemaMsg = AChildBuildMsg | AChildTestMsg;
interface AChildBuildMsg {
    hit_source: any;
}
interface AChildTestMsg {
    hit_source: any;
}
type StateName =
    'additional-tests' | TestMsgStateName;

const getMsgBody = (aChild: AChildMsg): any => {
    return _.get(aChild, 'hit_source.rawData.message.brokerMsgBody')!;
};


/**
 * Derived from topic
 *
 * Stage can be: 'build', 'dispatch', 'test', 'promote', etc....
 * stage (in standard called as `event`) is always the second item from the end of the topic
 * Examples:
 *
 * * pull-request.test.error -> test
 * * brew-build.promote.error -> promote
 *
 * State is always the latest part of the topic
 * Examples:
 *
 *  * brew-build.promote.error -> error
 *  * brew-build.test.complete -> complete
 */
type StageStateAChildren = [MsgStageName, StateName, number];
type AChildrenByStageName = {
    msgStageName: MsgStageName;
    aChildrenByStateName: AChildrenByStateName;
};
type AChildrenByStateName = {
    [key in StateName]?: AChild[];
};

export const mkStagesAndStates = (
    aChildren: AChildMsg[],
): StageStateAChildren[] => {
    const stagesStates: Array<AChildrenByStageName> = [];
    // Preprocess broker-messages into a list sorted by stage and state.
    const testMsgStagesStates = aChildrenByStageName(aChildren);
    stagesStates.push(...testMsgStagesStates);
    /*
     * Merge all the results into a list of triples with the structure
     *   [stage, state, [result1, ..., resultN]]
     */
    const stageStatesArray = mkStageStatesArray(stagesStates);
    return stageStatesArray;
};

/**
 * Return list of stages along with our current knowledge of the results
 * in each stage.
 *
 * It might happen from time to time that we don't receive a message about
 * a finished test while Greenwave does. In that case, Greenwave bases its
 * gating decision on information we don't have and cannot display. This
 * would also cause some important test suites to be omitted from the results
 * list and thus make their status invisible to maintainers.
 *
 * This function collects all the artifact's results that we know about as
 * well as those that only Greenwave knows (or does not know) about and
 * packs them into a unified structure. In this process, at the moment the
 * results we have (from testMsgAChild) have precendence over Greenwave's info.
 *
 * As an example, assume that the test `x.y.z` is required for gating.
 * Until the test finishes (or the requirement is waived), it's missing
 * from Greenwave's point of view. As long as it is so, we will display
 * the test as such in the dashboard.
 *
 * Now image that Greenwave receives a message that `x.y.z` has failed but
 * we receive no such message. Greenwave now changes its type to
 * `test-result-failed`. At this point, the dashboard should display it as
 * failed as well because Greenwave has just told us the result, even
 * though we didn't get the original message.
 *
 * mkStagesStates() returns a list of the form
 *     [
 *         {stage: 'test', states: {}},
 *         {stage: 'build', states: {}}
 *     ]
 * where each `states` key has the form
 *     {
 *         passed: [result1, result2]
 *         failed: [result3]
 *         info: [...]
 *         error: [...]
 *         queued: [...]
 *         running: [...]
 *     }
 */
const aChildrenByStageName = (aChildren: AChildMsg[]): AChildrenByStageName[] => {
    const aChildrenByStageName: AChildrenByStageName[] = [];
    const buildStage = _.omitBy(aChildrenByStateName(aChildren, 'build'), (x) =>
        _.isEmpty(x),
    );
    if (_.some(_.values(buildStage), 'length')) {
        const msgStageName: MsgStageName = 'build';
        aChildrenByStageName.push({
            msgStageName,
            aChildrenByStateName: buildStage,
        });
    }
    /*
    testStates resolves in:
        {
            passed: [artifact1, artifact2]
            failed: [artifact1]
            info: []
            error: []
            queued: []
            running: []
        }
    */
    let testStage: AChildrenByStateName = aChildrenByStateName(
        aChildren,
        'test',
    );
    testStage = _.omitBy(testStage, (x) => _.isEmpty(x));
    if (_.some(_.values(testStage), 'length')) {
        const msgStageName: MsgStageName = 'test';
        aChildrenByStageName.push({
            msgStageName,
            aChildrenByStateName: testStage,
        });
    }
    return aChildrenByStageName;
};

/*
stage_states_array is the second form:
    [
    ['build', 'pass', [result1, result2]],
    ['test', 'pass', [result3]]
    ]
*/
const mkStageStatesArray = (
    stageStates: Array<AChildrenByStageName>,
): StageStateAChildren[] => {
    const stageStatesArray: StageStateAChildren[] = [];
    for (const { msgStageName, aChildrenByStateName } of stageStates) {
        for (const [stateName, aChildren] of _.toPairs(aChildrenByStateName)) {
            /** _.toPairs(obj) ===> [pair1, pair2, pair3] where pair == [key, value] */
            stageStatesArray.push([
                msgStageName,
                stateName as MsgStateName,
                aChildren.length,
            ]);
        }
    }
    return stageStatesArray;
};

function isAChildSchemaMsg(
    aChild: AChild | undefined,
): aChild is AChildSchemaMsg {
    if (isAChildBuildMsg(aChild) || isAChildTestMsg(aChild)) {
        return true;
    }
    return false;
}

function isAChildBuildMsg(
    aChild: AChild | undefined,
): aChild is AChildBuildMsg {
    const msgStageName = _.get(aChild, 'hit_source.msgStage');
    if (msgStageName === 'build') {
        return true;
    }
    return false;
}

function isAChildTestMsg(
    aChild: AChild | undefined,
): aChild is AChildTestMsg {
    const msgStageName = _.get(aChild, 'hit_source.msgStage');
    if (msgStageName === 'test') {
        return true;
    }
    return false;
}

const getMsgStageName = (aChild: AChildSchemaMsg): MsgStageName => {
    return aChild.hit_source.msgStage;
};

const getMsgStateName = (aChild: AChildSchemaMsg): TestMsgStateName => {
    return aChild.hit_source.msgState;
};

/**
 * Transforms msgAChild to expected states in UI.
 *
 * For test events in the complete state is split between passed and failed.
 *
 * For build events the error is recognized as a failed state.
 *
 * for stage == 'test' replace complete: [] ==> failed: [], info: [], passed: []
 * From: [ state1, state2, state3, ...]
 * To:   { error: [], queued: [], running: [], failed: [], info: [], passed: [] }
 */
const aChildrenByStateName = (
    aChildren: AChildMsg[],
    msgStageName: MsgStageName,
): AChildrenByStateName => {
    const aChildrenByState: AChildrenByStateName = {};
    /** statesNames: ['running', 'complete', .... ] */
    const presentStates = _.map(aChildren, (aChild) => {
        if (!isAChildSchemaMsg(aChild)) {
            return;
        }
        return getMsgStateName(aChild);
    });
    const statesNames: StateName[] = _.intersection<StateName>(
        _.compact(presentStates),
        KnownMsgStates,
    );
    _.forEach(statesNames, (msgStateName) => {
        /**
         * For complete test states, count failed, passed and other events
         */
        /**
         * complete tests to extended: [passed, failed, info, needs_inspection, not_applicable]
         */
        if (msgStateName === 'complete' && msgStageName === 'test') {
            /**
             * pass tests
             */
            const aChildrenPassed = _.filter(aChildren, (aChild) => {
                if (!isAChildTestMsg(aChild)) {
                    return false;
                }
                const testResult = getTestMsgCompleteResult(
                    aChild,
                    msgStageName,
                    msgStateName,
                );
                return _.includes(['PASS', 'PASSED'], _.toUpper(testResult));
            });
            if (!_.isEmpty(aChildrenPassed)) {
                aChildrenByState['passed'] = aChildrenPassed;
            }
            /**
             * failed tests
             */
            const aChildrenFailed = _.filter(aChildren, (aChild) => {
                if (!isAChildTestMsg(aChild)) {
                    return false;
                }
                const testResult = getTestMsgCompleteResult(
                    aChild,
                    msgStageName,
                    msgStateName,
                );
                return _.includes(['FAIL', 'FAILED'], _.toUpper(testResult));
            });
            if (!_.isEmpty(aChildrenFailed)) {
                aChildrenByState['failed'] = aChildrenFailed;
            }
            /**
             * info tests
             */
            const aChildrenInfo = _.filter(aChildren, (aChild) => {
                if (!isAChildTestMsg(aChild)) {
                    return false;
                }
                const testResult = getTestMsgCompleteResult(
                    aChild,
                    msgStageName,
                    msgStateName,
                );
                return _.isEqual('INFO', _.toUpper(testResult));
            });
            if (!_.isEmpty(aChildrenInfo)) {
                aChildrenByState['info'] = aChildrenInfo;
            }
            /**
             * needs_inspection tests
             */
            const aChildrenNeedsInspection = _.filter(aChildren, (aChild) => {
                if (!isAChildTestMsg(aChild)) {
                    return false;
                }
                const testResult = getTestMsgCompleteResult(
                    aChild,
                    msgStageName,
                    msgStateName,
                );
                return _.isEqual('NEEDS_INSPECTION', _.toUpper(testResult));
            });
            if (!_.isEmpty(aChildrenNeedsInspection)) {
                aChildrenByState['needs_inspection'] = aChildrenNeedsInspection;
            }
            /**
             * not_applicable tests
             */
            const aChildrenNotApplicable = _.filter(
                aChildren,
                (aChild: AChildTestMsg) => {
                    const testResult = getTestMsgCompleteResult(
                        aChild,
                        msgStageName,
                        msgStateName,
                    );
                    return _.isEqual('NOT_APPLICABLE', _.toUpper(testResult));
                },
            );
            if (!_.isEmpty(aChildrenNotApplicable)) {
                aChildrenByState['not_applicable'] = aChildrenNeedsInspection;
            }
        } else if (msgStateName === 'error' && msgStageName === 'build') {
            const aChilrenBuildsFailed = _.filter(aChildren, (aChild) => {
                if (!isAChildSchemaMsg(aChild)) {
                    return false;
                }
                const aChildMsgStage = getMsgStageName(aChild);
                const aChildMsgState = getMsgStateName(aChild);
                if (
                    aChildMsgStage === msgStageName &&
                    aChildMsgState === msgStateName
                ) {
                    return true;
                }
                return false;
            });
            if (!_.isEmpty(aChilrenBuildsFailed)) {
                aChildrenByState['failed'] = aChilrenBuildsFailed;
            }
        } else {
            /** other categories for asked stage */
            const aChildrenOther = _.filter(aChildren, (aChild) => {
                if (!isAChildSchemaMsg(aChild)) {
                    return false;
                }
                const aChildMsgStage = getMsgStageName(aChild);
                const aChildMsgState = getMsgStateName(aChild);
                if (
                    aChildMsgStage === msgStageName &&
                    aChildMsgState === msgStateName
                ) {
                    return true;
                }
                return false;
            });
            if (!_.isEmpty(aChildrenOther)) {
                aChildrenByState[msgStateName] = aChildrenOther;
            }
        }
    });

    return aChildrenByState;
};

function isMsgV01(
    msgBody: any
): boolean {
    return msgBody?.version.startsWith('0.1.');
}
function isMsgV1(
    msgBody: any
): boolean {
    return (
        msgBody?.version.startsWith('0.2.') ||
        msgBody?.version.startsWith('1.')
    );
}

const getTestMsgCompleteResult = (
    aChild: AChildTestMsg,
    reqStage: MsgStageName,
    reqState: MsgStateName,
): string | undefined => {
    if (!isAChildSchemaMsg(aChild)) {
        return;
    }
    const aChildMsgStage = getMsgStageName(aChild);
    const aChildMsgState = getMsgStateName(aChild);
    if (aChildMsgStage !== reqStage || aChildMsgState !== reqState) {
        return;
    }
    let testResult: string | undefined;
    const msgBody = getMsgBody(aChild);
    if (isMsgV01(msgBody)) {
        testResult = msgBody.status;
    }
    if (isMsgV1(msgBody)) {
        testResult = msgBody.test.result;
    }
    return testResult;
};
