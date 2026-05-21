import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    jwtVerify<Decoded extends object>(): Promise<Decoded>;
    jwtVerify<Decoded extends object>(options: {
      decode: object;
      verify: object;
    }): Promise<Decoded>;
    user: { sub: string; communityId?: string | null };
  }
}
