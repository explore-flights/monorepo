import * as cdk from 'aws-cdk-lib';
import { IHostedZone } from 'aws-cdk-lib/aws-route53';
import { Certificate, CertificateValidation, ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

export interface AcmStackProps extends cdk.StackProps {
  certificates: Record<string, IHostedZone>;
}

export class AcmStack extends cdk.Stack {
  readonly certificates: Record<string, ICertificate>;

  constructor(scope: Construct, id: string, props: AcmStackProps) {
    super(scope, id, props);

    this.certificates = {};
    for (const [domain, zone] of Object.entries(props.certificates)) {
      this.certificates[domain] = new Certificate(this, 'DistributionCert-' + domain, {
        domainName: domain,
        validation: CertificateValidation.fromDns(zone),
      });
    }
  }
}