import jwt from 'jsonwebtoken';
import { config } from "dotenv";

config();
const secret = process.env.JWT_SECRET_KEY!;

const generateToken = (payload: string): string => {
    const configuredExpiration = process.env.JWT_EXPIRATION?.trim();
    if (!secret) {
        throw new Error('JWT_SECRET_KEY environment variable is missing.');
    }

    if (!configuredExpiration) {
        throw new Error('JWT_EXPIRATION environment variable is missing.');
    }

    // Environment values are strings; jsonwebtoken treats unitless strings as milliseconds.
    const expiresIn = /^\d+$/.test(configuredExpiration)
        ? Number(configuredExpiration)
        : configuredExpiration as import('jsonwebtoken').SignOptions['expiresIn'];

    try {
        const token = jwt.sign({ userId: payload }, secret, { expiresIn });
        return token;
    } catch (error) {
        console.error('Error generating JWT token:', error);
        throw new Error('Failed to generate JWT token');
    }
}

export default generateToken;
