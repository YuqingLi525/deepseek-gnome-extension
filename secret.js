import Secret from 'gi://Secret';

const ATTRIBUTES = {
    account: 'default',
};

const SCHEMA = new Secret.Schema(
    'com.github.YuqingLi525.DeepSeekUsage',
    Secret.SchemaFlags.NONE,
    {
        account: Secret.SchemaAttributeType.STRING,
    }
);

export function lookupApiKey() {
    return Secret.password_lookup_sync(SCHEMA, ATTRIBUTES, null);
}

export function storeApiKey(apiKey) {
    return Secret.password_store_sync(
        SCHEMA,
        ATTRIBUTES,
        Secret.COLLECTION_DEFAULT,
        'DeepSeek Usage GNOME Extension API Key',
        apiKey,
        null
    );
}

export function clearApiKey() {
    return Secret.password_clear_sync(SCHEMA, ATTRIBUTES, null);
}
