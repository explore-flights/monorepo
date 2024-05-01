import { Construct } from 'constructs';
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  HttpVersion,
  IDistribution,
  OriginProtocolPolicy,
  OriginRequestCookieBehavior,
  OriginRequestHeaderBehavior,
  OriginRequestPolicy,
  OriginRequestQueryStringBehavior,
  PriceClass,
  ResponseHeadersPolicy,
  SecurityPolicyProtocol,
  ViewerProtocolPolicy
} from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { Fn, Stack } from 'aws-cdk-lib';
import { IFunctionUrl } from 'aws-cdk-lib/aws-lambda';

export interface CloudfrontConstructProps {
  domain: string;
  certificateId: string;
  apiLambdaFunctionURL: IFunctionUrl;
}

export class CloudfrontConstruct extends Construct {
  readonly distribution: IDistribution;

  constructor(scope: Construct, id: string, props: CloudfrontConstructProps) {
    super(scope, id);

    const allExceptHostOriginRequestPolicy = new OriginRequestPolicy(this, 'AllExceptHostORP', {
      headerBehavior: OriginRequestHeaderBehavior.denyList('Host'),
      cookieBehavior: OriginRequestCookieBehavior.all(),
      queryStringBehavior: OriginRequestQueryStringBehavior.all(),
    });

    const noCacheResponseHeadersPolicy = new ResponseHeadersPolicy(this, 'NoCacheResponseHeadersPolicy', {
      customHeadersBehavior: {
        customHeaders: [
          { header: 'Cache-Control', value: 'private, no-cache, no-store, max-age=0, must-revalidate', override: true, }
        ],
      },
    });

    this.distribution = new Distribution(this, 'Distribution', {
      priceClass: PriceClass.PRICE_CLASS_ALL,
      httpVersion: HttpVersion.HTTP2_AND_3,
      enableIpv6: true,
      domainNames: [props.domain],
      certificate: Certificate.fromCertificateArn(
        this,
        'DistributionCertificate',
        Stack.of(this).formatArn({
          service: 'acm',
          region: 'us-east-1',
          resource: 'certificate',
          resourceName: props.certificateId,
        }),
      ),
      minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
      defaultBehavior: {
        origin: new HttpOrigin(Fn.select(2, Fn.split('/', props.apiLambdaFunctionURL.url)), {
          protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
          customHeaders: { Forwarded: `host=${props.domain};proto=https` },
          originShieldEnabled: true,
          originShieldRegion: Stack.of(this).region,
        }),
        compress: true,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_ALL,
        cachePolicy: CachePolicy.CACHING_DISABLED,
        originRequestPolicy: allExceptHostOriginRequestPolicy,
        responseHeadersPolicy: noCacheResponseHeadersPolicy,
      },
      additionalBehaviors: {},
      enableLogging: false,
      enabled: true,
    });
  }
}