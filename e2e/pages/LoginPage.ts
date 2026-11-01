import { type Page } from '@playwright/test';

export const DEMO_PASSWORD = 'ChangeMe123!';

export class LoginPage {
  constructor(private readonly page: Page) {}

  async signIn(username: string, password = DEMO_PASSWORD) {
    await this.page.goto('/');
    await this.page.getByLabel('Username').fill(username);
    await this.page.getByLabel('Password').fill(password);
    await this.page.getByRole('button', { name: 'Sign in' }).click();
    await this.page.getByRole('button', { name: 'Sign out' }).waitFor();
  }
}
