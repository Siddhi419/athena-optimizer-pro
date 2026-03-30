// Replace these with your actual AWS Cognito credentials
export const COGNITO_CONFIG = {
  // User Pool ID: found in Cognito → User Pools → General Settings
  // Format: region_xxxxxxxxx (e.g., us-east-1_AbCdEfGhI)
  UserPoolId: 'YOUR_USER_POOL_ID',

  // App Client ID: found in App Integration → App Client Settings
  ClientId: 'YOUR_APP_CLIENT_ID',

  // Identity Pool ID: found in Cognito → Identity Pools
  // Format: region:guid (e.g., us-east-1:12345678-abcd-1234-efgh-123456789012)
  IdentityPoolId: 'YOUR_IDENTITY_POOL_ID',

  // AWS Region (e.g., us-east-1)
  Region: 'us-east-1',
};
