import jwt from 'jsonwebtoken';
import { config } from "dotenv";

config();
const secret = process.env.JWT_SECRET_KEY!;
const expiresIn = process.env.JWT_EXPIRATION as import('jsonwebtoken').SignOptions['expiresIn'] | undefined;

const generateToken = (payload: string): string => {
    if (!secret) {
        throw new Error('JWT_SECRET_KEY environment variable is missing.');
    }

    if (!expiresIn) {
        throw new Error('JWT_EXPIRATION environment variable is missing.');
    }

    try {
        const token = jwt.sign(payload, secret, { expiresIn });
        return token;
    } catch (error) {
        console.error('Error generating JWT token:', error);
        throw new Error('Failed to generate JWT token');
    }
}

export default generateToken;