import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConnectionPool } from 'mssql';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject('MSSQL_CONNECTION') private readonly db: ConnectionPool, // 👈
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'your-secret-key',
      passReqToCallback: true,  // pour récupérer le token brut
    });
  }

async validate(req: any, payload: any) {
  const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);

  const res = await this.db.request()
    .input('Token', token)
    .query(`SELECT TOP 1 1 FROM dbo.UserTokens WHERE token = @Token`);

  if (!res.recordset.length) {
    throw new UnauthorizedException('Token invalide ou déjà révoqué');
  }

  return {
    sub: payload.sub, // ✅ garder le nom 'sub' pour correspondre à req.user.sub
    email: payload.email,
    username: payload.username,
    role: payload.role,
    numeroTelephone: payload.numeroTelephone,
  };
}


}
