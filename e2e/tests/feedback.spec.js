import { expect, test } from '@playwright/test';
import { simularApi } from './api-simulada.js';

test('mensagem vazia é recusada com aviso acessível', async ({ page }) => {
  const feedbacks = await simularApi(page);
  await page.goto('/sobre.html');
  await page.getByRole('button', { name: 'Enviar' }).click();

  const mensagem = page.getByLabel('Mensagem (obrigatória)');
  await expect(mensagem).toHaveAttribute('aria-invalid', 'true');
  await expect(mensagem).toBeFocused();
  await expect(page.getByText('Escreva uma mensagem com pelo menos 3 caracteres.')).toBeVisible();
  expect(feedbacks).toEqual([]);
});

test('feedback válido é enviado para a API e o formulário é limpo', async ({ page }) => {
  const feedbacks = await simularApi(page);
  await page.goto('/sobre.html');
  await page.getByLabel('Nome (opcional)').fill('Ana');
  await page.getByLabel('5 – Ótimo').check();
  await page.getByLabel('Mensagem (obrigatória)').fill('O buscador ajudou muito!');
  await page.getByRole('button', { name: 'Enviar' }).click();

  await expect(page.getByText('Obrigado pelo seu feedback!')).toBeVisible();
  expect(feedbacks).toEqual([{ nome: 'Ana', mensagem: 'O buscador ajudou muito!', avaliacao: 5 }]);
  await expect(page.getByLabel('Mensagem (obrigatória)')).toHaveValue('');
});
