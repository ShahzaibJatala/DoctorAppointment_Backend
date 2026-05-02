import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from 'src/guards/role/role.enums';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get<string>('MY_JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    // console.log('JWT Payload decoded successfully:', payload);
    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}
