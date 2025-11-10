declare namespace NodeJS {
  interface ProcessEnv {
    SHOPIFY_APP_NAME: string;
    SHOPIFY_API_KEY: string;
    SHOPIFY_API_SECRET: string;
    SHOPIFY_APP_URL: string;
    SCOPES: string;
    PORT: string;
    DATABASE_URL: string;
  }
}
