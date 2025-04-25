import { Construct } from 'constructs';
import { EcsRunTask, EcsRunTaskProps } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { CustomState, StateGraph } from 'aws-cdk-lib/aws-stepfunctions';

export class EcsRunTaskSync extends EcsRunTask {

  constructor(private readonly scope: Construct, private readonly _id: string, props: EcsRunTaskProps) {
    super(scope, `${_id}-Virtual`, props);
  }

  public bindToGraph(graph: StateGraph) {
    const stateJson: {[k: string]: any} = this.toStateJson();
    stateJson['Resource'] = stateJson['Resource'] + '.sync';

    new CustomState(this.scope, this._id, {
      stateJson: stateJson,
    }).bindToGraph(graph);

    if (this.taskPolicies) {
      for (const stmt of this.taskPolicies) {
        graph.registerPolicyStatement(stmt);
      }
    }
  }
}