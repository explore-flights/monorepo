import { Construct } from 'constructs';
import {
  AllowedMethods, CachePolicy,
  Distribution,
  HttpVersion,
  OriginProtocolPolicy, OriginRequestPolicy,
  PriceClass, ResponseHeadersPolicy,
  SecurityPolicyProtocol,
  ViewerProtocolPolicy
} from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { AaaaRecord, ARecord, IHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';

export interface CloudfrontConstructProps {
  domain: string;
  hostedZone: IHostedZone;
  certificate: ICertificate;
}

export class CloudfrontConstruct extends Construct {
  constructor(scope: Construct, id: string, props: CloudfrontConstructProps) {
    super(scope, id);

    const distribution = new Distribution(this, 'Distribution', {
      priceClass: PriceClass.PRICE_CLASS_ALL,
      httpVersion: HttpVersion.HTTP2_AND_3,
      enableIpv6: true,
      domainNames: [props.domain],
      certificate: props.certificate,
      minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
      defaultBehavior: {
        origin: new HttpOrigin('httpbin.org', {
          protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
          originPath: '/get'
        }),
        compress: true,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_ALL,
        cachePolicy: CachePolicy.CACHING_DISABLED,
        originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_AND_CLOUDFRONT_2022,
        responseHeadersPolicy: new ResponseHeadersPolicy(this, 'NoCacheResponseHeadersPolicy', {
          customHeadersBehavior: {
            customHeaders: [
              { header: 'Cache-Control', value: 'private, no-cache, no-store, max-age=0, must-revalidate', override: true, }
            ],
          },
        }),
      },
      additionalBehaviors: {},
      enableLogging: false,
      enabled: true,
    });

    new ARecord(this, 'WebsiteAliasARecord', {
      zone: props.hostedZone,
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
    });

    new AaaaRecord(this, 'WebsiteAliasAAAARecord', {
      zone: props.hostedZone,
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
    });
  }
}