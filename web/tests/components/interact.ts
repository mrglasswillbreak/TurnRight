import { act } from 'react';
import { page } from 'vitest/browser';

export const button = (name: string) =>
  page.getByRole('button', { name, exact: true });
export const field = (name: string) =>
  page.getByLabelText(
    new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  );
export const click = (name: string) => act(() => button(name).click());
export const fill = (name: string, value: string) =>
  act(() => field(name).fill(value));
export const choose = (name: string, value: string) =>
  act(() => {
    const select = field(name);
    const option = [...(select.element() as HTMLSelectElement).options].find(
      (o) => o.value === value,
    );
    if (!option) throw Error(`No ${name} option with value ${value}`);
    return select.selectOptions(option);
  });
export const toggle = (name: string) =>
  act(() => page.getByRole('checkbox', { name, exact: true }).click());
export const expand = (name: string) =>
  act(() => page.getByText(name, { exact: true }).click());
export const blur = (name: string) =>
  act(() => (field(name).element() as HTMLElement).blur());
// Native colour/range pickers cannot be filled through Playwright's text API.
export const setPicker = (name: string, value: string) =>
  act(() => {
    const input = field(name).element();
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
