import { FunctionUrlOrigin, FunctionUrlOriginProps } from 'aws-cdk-lib/aws-cloudfront-origins';
import { IFunctionUrl } from 'aws-cdk-lib/aws-lambda';
import { Reference } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { OriginBindConfig, OriginBindOptions } from 'aws-cdk-lib/aws-cloudfront';

export type FunctionUrlOriginWithOACProps = FunctionUrlOriginProps & {
  oacId: Reference;
};

// https://github.com/aws/aws-cdk/issues/21771#issuecomment-2073425721
export class FunctionUrlOriginWithOAC extends FunctionUrlOrigin {
  private readonly oacId: Reference;

  constructor(functionUrl: IFunctionUrl, props: FunctionUrlOriginWithOACProps) {
    super(functionUrl, props);
    this.oacId = props.oacId;
  }

  public bind(scope: Construct, options: OriginBindOptions): OriginBindConfig {
    const originConfig = super.bind(scope, options);
    if (!originConfig.originProperty) {
      throw new Error('originProperty is required');
    }

    return {
      ...originConfig,
      originProperty: {
        ...originConfig.originProperty,
        originAccessControlId: this.oacId.toString(),
      },
    };
  }
}