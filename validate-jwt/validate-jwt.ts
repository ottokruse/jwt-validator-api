import * as jwtlib from 'jsonwebtoken';
import * as jwksClient from 'jwks-rsa';
import { APIGatewayProxyHandler } from 'aws-lambda';

let _jwksClient: jwksClient.JwksClient;
let _jwksClientUri: string;

async function getSigningKey(jwksUri: string, kid: string) {
    if (!_jwksClient || jwksUri !== _jwksClientUri) {
        _jwksClientUri = jwksUri;
        _jwksClient = jwksClient({ cache: true, rateLimit: true, jwksUri });
    }
    return new Promise<string>((resolve, reject) => {
        _jwksClient.getSigningKey(kid, (err, jwk) => {
            if (err) {
                reject(err);
            } else {
                resolve(jwk.publicKey || jwk.rsaPublicKey);
            }
        });
    });
}

export interface ValidationResult {
    valid: boolean;
    decodedToken: object | string;
    messages: string[];
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE',
    'Access-Control-Max-Age': 86400,
    'Access-Control-Allow-Headers': 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range',
};

async function validate(jwtToken: string, jwksUri: string, issuer: string, audience: string) {

    const messages: string[] = [];

    const decodedToken = jwtlib.decode(jwtToken, { complete: true }) as object;
    if (!decodedToken) {
        throw new Error('Cannot parse JWT token');
    }

    // Fetch the JWK with which the JWT was signed
    let jwk: string;
    try {
        if (!jwksUri) {
            const tokenIssuer = decodedToken['payload'] && decodedToken['payload']['iss'];
            jwksUri = `${tokenIssuer}/.well-known/jwks.json`;
            messages.push(`Using jwks_uri constructed from token iss claim: ${jwksUri}`);
        }
        const kid = decodedToken['header'] && decodedToken['header']['kid'];
        jwk = await getSigningKey(jwksUri, kid);
    } catch (err) {
        messages.push(err.message);
        return {
            valid: err ? false : true,
            decodedToken,
            messages
        } as ValidationResult;
    }

    // Verify the JWT
    // This either rejects (JWT not valid), or resolves withe the decoded token (object or string)
    const verificationOptions = {
        audience,
        issuer,
        ignoreExpiration: false
    };
    return new Promise<ValidationResult>(resolve => {
        jwtlib.verify(jwtToken, jwk, verificationOptions, (err, _) => {
            if (err) {
                messages.push(err.message);
            }
            resolve({
                valid: err ? false : true,
                decodedToken,
                messages
            });
        });
    });
}

export const handler: APIGatewayProxyHandler = async (event, _context) => {
    try {
        const { jwt, jwks_uri, issuer, audience } = JSON.parse(event.body);
        const validationResult = await validate(jwt, jwks_uri, issuer, audience);
        return {
            'statusCode': 200,
            'body': JSON.stringify(validationResult),
            'headers': corsHeaders,
        };
    } catch (err) {
        console.log(err);
        return {
            'statusCode': 200,
            'body': JSON.stringify({ messages: [err.message || 'Oops ... something went wrong'] }),
            'headers': corsHeaders,
        };
    }
};
