import { Construct } from 'constructs';
import {
  AllowedMethods,
  CachePolicy, CfnOriginAccessControl,
  Distribution, Function, FunctionCode, FunctionEventType, FunctionRuntime, HeadersFrameOption,
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
import { Duration, Fn, Stack } from 'aws-cdk-lib';
import { IFunctionUrl } from 'aws-cdk-lib/aws-lambda';
import { Bucket, IBucket } from 'aws-cdk-lib/aws-s3';
import { S3OriginWithOAC } from './s3-origin-with-oac';

export interface CloudfrontConstructProps {
  domain: string;
  certificateId: string;
  uiResourcesBucket: IBucket;
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
            `connect-src 'self' http://127.0.0.1:8090/`,
            `style-src 'self' 'unsafe-inline'`,
            `font-src data:`,
            `img-src 'self'`,
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

    // region OriginRequestPolicy -  which headers, cookies and query params should be forwarded to the origin
    const allExceptHostOriginRequestPolicy = new OriginRequestPolicy(this, 'AllExceptHostORP', {
      headerBehavior: OriginRequestHeaderBehavior.denyList('Host'),
      cookieBehavior: OriginRequestCookieBehavior.all(),
      queryStringBehavior: OriginRequestQueryStringBehavior.all(),
    });
    // endregion

    // region origins
    const apiLambdaOrigin = new HttpOrigin(Fn.select(2, Fn.split('/', props.apiLambdaFunctionURL.url)), {
      protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
      customHeaders: { Forwarded: `host=${props.domain};proto=https` },
      originShieldEnabled: true,
      originShieldRegion: Stack.of(this).region,
    });
    // endregion

    const uiResourcesOAC = new CfnOriginAccessControl(this, 'UIResourcesOAC', {
      originAccessControlConfig: {
        // these names must be unique
        name: `${this.node.path.replace('/', '-')}-UIResourcesOAC`,
        description: 'OAC to access UI resources bucket',
        originAccessControlOriginType: 's3',
        signingBehavior: 'always',
        signingProtocol: 'sigv4',
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
        origin: new S3OriginWithOAC(
          // prevent CF from adding its OriginAccessIdentity to the BucketPolicy since we're using OriginAccessControl (see below)
          Bucket.fromBucketName(this, 'UIResourcesBucketCopy', props.uiResourcesBucket.bucketName),
          { oacId: uiResourcesOAC.getAtt('Id') },
        ),
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
          originRequestPolicy: allExceptHostOriginRequestPolicy,
          responseHeadersPolicy: noCacheResponseHeadersPolicy,
        },
        '/auth/*': {
          origin: apiLambdaOrigin,
          compress: true,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: AllowedMethods.ALLOW_ALL,
          cachePolicy: CachePolicy.CACHING_DISABLED,
          originRequestPolicy: allExceptHostOriginRequestPolicy,
          responseHeadersPolicy: noCacheResponseHeadersPolicy,
        },
        '/data/*': {
          origin: apiLambdaOrigin,
          compress: true,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachePolicy: CachePolicy.CACHING_OPTIMIZED,
          originRequestPolicy: allExceptHostOriginRequestPolicy,
          responseHeadersPolicy: cacheOverridableResponseHeadersPolicy,
        },
      },
      enableLogging: false,
      enabled: true,
    });
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