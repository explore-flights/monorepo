import { Construct } from 'constructs';
import {
  AllowedMethods,
  CachePolicy,
  CfnOriginAccessControl,
  Distribution,
  Function,
  FunctionCode,
  FunctionEventType,
  FunctionRuntime,
  HeadersFrameOption,
  HttpVersion,
  IDistribution,
  OriginAccessControlOriginType,
  OriginRequestPolicy,
  PriceClass,
  ResponseHeadersPolicy,
  S3OriginAccessControl,
  SecurityPolicyProtocol,
  Signing,
  ViewerProtocolPolicy
} from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { Duration, Stack } from 'aws-cdk-lib';
import { IFunction, IFunctionUrl } from 'aws-cdk-lib/aws-lambda';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { CloudfrontUtil } from '../util/util';
import { FunctionUrlOriginWithOAC } from './function-url-origin-with-oac';

export interface CloudfrontConstructProps {
  domain: string;
  certificateId: string;
  uiResourcesBucket: IBucket;
  apiLambda: IFunction;
  apiLambdaFunctionURL: IFunctionUrl;
}

export class CloudfrontConstruct extends Construct {
  readonly distribution: IDistribution;

  constructor(scope: Construct, id: string, props: CloudfrontConstructProps) {
    super(scope, id);

    const defaultRootObject = 'index.html';

    // region ResponseHeadersPolicy - which headers should be sent back to the viewer
    const uiResponseHeadersPolicy = new ResponseHeadersPolicy(this, 'UIResponseHeadersPolicy', {
      securityHeadersBehavior: {
        frameOptions: {
          frameOption: HeadersFrameOption.DENY,
          override: true,
        },
        contentSecurityPolicy: {
          contentSecurityPolicy: [
            `default-src 'self'`,
            `connect-src 'self' http://127.0.0.1:8090/ https://api.maptiler.com/`,
            `style-src 'self' 'unsafe-inline'`,
            `font-src data:`,
            `img-src 'self' data: blob:`,
            `worker-src blob:`,
            `child-src blob:`,
          ].join('; '),
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: Duration.hours(720),
          includeSubdomains: true,
          override: true,
        },
      },
    });

    const noCacheResponseHeadersPolicy = new ResponseHeadersPolicy(this, 'NoCacheResponseHeadersPolicy', {
      customHeadersBehavior: {
        customHeaders: [
          { header: 'Cache-Control', value: 'private, no-cache, no-store, max-age=0, must-revalidate', override: true, }
        ],
      },
    });

    const cacheOverridableResponseHeadersPolicy = new ResponseHeadersPolicy(this, 'CacheOverridableResponseHeadersPolicy', {
      customHeadersBehavior: {
        customHeaders: [
          { header: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400', override: false, }
        ],
      },
    });
    // endregion

    // region origins
    const apiLambdaOAC = new CfnOriginAccessControl(this, 'APILambdaOACv2', {
      originAccessControlConfig: {
        name: `${this.node.path.replace('/', '-')}-APILambdaOACv2`,
        description: 'OAC to access API Lambda Function URL',
        originAccessControlOriginType: OriginAccessControlOriginType.LAMBDA,
        signingBehavior: 'always',
        signingProtocol: 'sigv4',
      },
    });

    const apiLambdaOrigin = new FunctionUrlOriginWithOAC(props.apiLambdaFunctionURL, {
      customHeaders: { Forwarded: `host=${props.domain};proto=https` },
      originShieldEnabled: true,
      originShieldRegion: Stack.of(this).region,
      originAccessControlId: apiLambdaOAC.attrId, // not supported (yet)
      oacId: apiLambdaOAC.getAtt('Id'),
    });
    // endregion

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
        origin: S3BucketOrigin.withOriginAccessControl(props.uiResourcesBucket, {
          originAccessControl: new S3OriginAccessControl(this, 'UIResourcesOACv2', {
            description: 'OAC to access UI resources bucket',
            signing: Signing.SIGV4_ALWAYS,
          }),
          // originAccessLevels: [], // manually configured with ListBucket via CloudfrontUtil
        }),
        compress: true,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        originRequestPolicy: OriginRequestPolicy.CORS_S3_ORIGIN,
        responseHeadersPolicy: uiResponseHeadersPolicy,
        functionAssociations: [
          {
            function: new Function(this, 'UIResourcesDefaultRootFunction', {
              code: FunctionCode.fromInline(buildCloudFrontDefaultRootObjectFunction(defaultRootObject)),
              runtime: FunctionRuntime.JS_1_0,
            }),
            eventType: FunctionEventType.VIEWER_REQUEST,
          },
          {
            function: new Function(this, 'UIResourcesHeadersFunction', {
              code: FunctionCode.fromInline(buildCloudfrontHeadersFunction(defaultRootObject)),
              runtime: FunctionRuntime.JS_1_0,
            }),
            eventType: FunctionEventType.VIEWER_RESPONSE,
          },
        ],
      },
      additionalBehaviors: {
        '/api/*': {
          origin: apiLambdaOrigin,
          compress: true,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: AllowedMethods.ALLOW_ALL,
          cachePolicy: CachePolicy.CACHING_DISABLED,
          originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: noCacheResponseHeadersPolicy,
        },
        '/auth/*': {
          origin: apiLambdaOrigin,
          compress: true,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: AllowedMethods.ALLOW_ALL,
          cachePolicy: CachePolicy.CACHING_DISABLED,
          originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: noCacheResponseHeadersPolicy,
        },
        '/data/*': {
          origin: apiLambdaOrigin,
          compress: true,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachePolicy: CachePolicy.CACHING_OPTIMIZED,
          originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: cacheOverridableResponseHeadersPolicy,
        },
      },
      enableLogging: false,
      enabled: true,
    });

    CloudfrontUtil.addCloudfrontOACToBucketResourcePolicy(props.uiResourcesBucket, this.distribution, '', true);
    CloudfrontUtil.addCloudfrontOACToLambdaResourcePolicy(id, props.apiLambda, this.distribution);
  }
}

function buildCloudFrontDefaultRootObjectFunction(defaultRootObject: string): string {
  // json is valid js syntax, so we can just put it directly into the js code
  const ignoreSuffixesJSON = JSON.stringify({
    '.png': true,
    '.zip': true,
    '.svg': true,
    '.txt': true,
    '.html': true,
    '.js': true,
    '.css': true,
    '.ico': true,
    '.xml': true,
  });
  const defaultRootObjectJSON = JSON.stringify(`/${defaultRootObject}`);

  return `
var IGNORE_SUFFIXES = ${ignoreSuffixesJSON};
function handler(event) {
  var suffixIndex = event.request.uri.lastIndexOf('.');
  if (suffixIndex !== -1) {
    var suffix = event.request.uri.substring(suffixIndex);
    if (IGNORE_SUFFIXES[suffix]) {
      return event.request;
    }
  }

  event.request.uri = ${defaultRootObjectJSON};
  return event.request;
}
    `;
}

function buildCloudfrontHeadersFunction(defaultRootObject: string): string {
  const defaultRootObjectJSON = JSON.stringify(`/${defaultRootObject}`);

  return `
function handler(event) {
  var request = event.request;
  var response = event.response;
  var headers = response.headers;
  
  if (request.uri === ${defaultRootObjectJSON}) {
    headers['cache-control'] = {value: 'private, no-cache, no-store, max-age=0, must-revalidate'};
  } else {
    var suffixIndex = request.uri.lastIndexOf('.');
    if (suffixIndex !== -1) {
      var suffix = request.uri.substring(suffixIndex);
      if (suffix === '.css' || suffix === '.js') {
        headers['cache-control'] = {value: 'public, max-age=31536000, immutable'};
      } else {
        headers['cache-control'] = {value: 'public, max-age=604800, stale-while-revalidate=86400'};
      }
    }
  }
  
  return response;
}
  `;
}