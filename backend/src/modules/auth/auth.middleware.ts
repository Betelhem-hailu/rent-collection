import { Response, NextFunction } from "express";
import { verify } from "jsonwebtoken";
import { AuthRequest } from "../../utils/type.js";
import { AuthRepository } from "./auth.repository.js";

const secret = process.env.JWT_SECRET_KEY!;
export class AuthMiddleware {
    constructor(private authRepository: AuthRepository) {}
    async authenticated(req: AuthRequest, res: Response, next: NextFunction) {
        //checks the request header for the token
        //checks if the token is valid and not expired
        //if it is invalid or expired, it returns an error response
        //if it is valid, it adds the user information to the request object and calls the next middleware
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ message: 'Authorization header missing' });
        }
        if (!authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Invalid authorization header format' });
        }
        const token = authHeader.split(' ')[1];
        if (!token) { return res.status(401).json({ message: "Token missing", }); } 
        try { const payload = verify(token, secret); 
            req.userId = (payload as { userId: string }).userId; 
            next(); 
        } catch (error) { 
            return res.status(401).json({ 
                message: "Invalid or expired token", 
            }); 
        }
    }
    
    async authorize(roles: string[]) {
        return async (req: AuthRequest, res: Response, next: NextFunction) => {
            if (!req.userId) {
                return res.status(401).json({ message: 'User not authenticated' });
            }
            const userRole = await this.authRepository.findRoleByUserId(req.userId);
            if (!userRole) {
                return res.status(403).json({ message: 'User role not found' });
            }
            if (userRole && !roles.includes(userRole)) {
                return res.status(403).json({ message: 'User not authorized' });
            }
            next();
        };
    }
}