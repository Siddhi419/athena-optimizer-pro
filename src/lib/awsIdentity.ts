import {
  CognitoIdentityClient,
  GetIdCommand,
  GetCredentialsForIdentityCommand,
} from '@aws-sdk/client-cognito-identity';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { COGNITO_CONFIG } from './cognitoConfig';

export interface AwsIdentityInfo {
  arn: string;
  accountId: string;
  identityId: string;
  roleArn: string;
  accessKeyId: string;
  region: string;
}

export async function getAwsIdentity(idToken: string): Promise<AwsIdentityInfo> {
  const { Region, IdentityPoolId, UserPoolId } = COGNITO_CONFIG;
  const logins = { [`cognito-idp.${Region}.amazonaws.com/${UserPoolId}`]: idToken };

  const cognitoIdentity = new CognitoIdentityClient({ region: Region });

  // Get Identity ID from Cognito Identity Pool
  const { IdentityId } = await cognitoIdentity.send(
    new GetIdCommand({ IdentityPoolId, Logins: logins })
  );

  if (!IdentityId) throw new Error('Failed to get Cognito Identity ID');

  // Get temporary AWS credentials
  const credResult = await cognitoIdentity.send(
    new GetCredentialsForIdentityCommand({ IdentityId, Logins: logins })
  );

  const creds = credResult.Credentials;
  if (!creds?.AccessKeyId || !creds.SecretKey || !creds.SessionToken) {
    throw new Error('Failed to get AWS credentials');
  }

  // Use STS to get caller identity (ARN, Account)
  const sts = new STSClient({
    region: Region,
    credentials: {
      accessKeyId: creds.AccessKeyId,
      secretAccessKey: creds.SecretKey,
      sessionToken: creds.SessionToken,
    },
  });

  const identity = await sts.send(new GetCallerIdentityCommand({}));

  return {
    arn: identity.Arn || 'Unknown',
    accountId: identity.Account || 'Unknown',
    identityId: IdentityId,
    roleArn: identity.Arn?.replace(/:assumed-role\//, ':role/').replace(/\/[^/]+$/, '') || 'Unknown',
    accessKeyId: creds.AccessKeyId,
    region: Region,
  };
}
