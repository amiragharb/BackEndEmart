import { JwtAuthGuard } from "./jwt-auth.guard";

describe('JwtAuthGuard', () => {
  it('should be defined', () => {
    expect(new JwtAuthGuard()).toBeDefined();
  });
})
//Vérifier que le JwtAuthGuard est bien défini et instancié