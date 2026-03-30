// Replace these with your actual AWS Cognito credentials
// Get them from AWS Console → Cognito → User Pools → Your Pool
export const COGNITO_CONFIG = {
  // User Pool ID: found in General Settings of your User Pool
  // Format: region_xxxxxxxxx (e.g., us-east-1_AbCdEfGhI)
  UserPoolId: 'YOUR_USER_POOL_ID',

  // App Client ID: found in App Integration → App Client Settings
  // Format: alphanumeric string (e.g., 1abc2defg3hijklmnop4qrst)
  ClientId: 'YOUR_APP_CLIENT_ID',
};
