import {
  CognitoIdentityClient,
  GetIdCommand,
  GetCredentialsForIdentityCommand,
} from '@aws-sdk/client-cognito-identity';
import { COGNITO_CONFIG } from './cognitoConfig';

export interface TempAwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
}

export async function getTempCredentials(idToken: string): Promise<TempAwsCredentials> {
  const { Region, IdentityPoolId, UserPoolId } = COGNITO_CONFIG;
  const logins = { [`cognito-idp.${Region}.amazonaws.com/${UserPoolId}`]: idToken };

  const client = new CognitoIdentityClient({ region: Region });

  const { IdentityId } = await client.send(
    new GetIdCommand({ IdentityPoolId, Logins: logins })
  );
  if (!IdentityId) throw new Error('Failed to get Identity ID');

  const credResult = await client.send(
    new GetCredentialsForIdentityCommand({ IdentityId, Logins: logins })
  );

  const creds = credResult.Credentials;
  if (!creds?.AccessKeyId || !creds.SecretKey || !creds.SessionToken) {
    throw new Error('Failed to get temporary credentials');
  }

  return {
    accessKeyId: creds.AccessKeyId,
    secretAccessKey: creds.SecretKey,
    sessionToken: creds.SessionToken,
  };
}
