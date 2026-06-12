export const ROLE_DEFINITIONS: Record<
  string,
  { id: string; role_id: string; name: string }
> = {
  cashier: {
    id: 'baec941c-d610-4f2f-b35b-d21318d380f0',
    role_id: '32146a0a-c622-440b-ad8b-27f64e39aba8',
    name: 'Кассир',
  },
  admin: {
    id: 'ee70fb98-99fc-4d2e-8070-1f16361badfd',
    role_id: '70f2f91d-ff29-4c86-ae0c-ce0b181018e0',
    name: 'Админ',
  },
  owner: {
    id: '7c88f602-449e-487f-bd6b-cf7d3e01f072',
    role_id: 'owner',
    name: 'Owner',
  },
  store_manager: {
    id: '2afe4c1a-01bf-49b6-b1eb-af4f5b094302',
    role_id: 'ddf1c050-b868-4231-8a72-d9fa68e8f586',
    name: 'Управляющий магазином',
  },
  employee: {
    id: '14699b27-9b77-4ae5-be8c-ff798a9cd7f1',
    role_id: '32146a0a-c622-440b-ad8b-27f64e39aba8',
    name: 'Сотрудник',
  },
  platform_admin: {
    id: 'df1d8bf5-97ab-4ab6-a77e-bf0efcb44db7',
    role_id: 'platform_admin',
    name: 'Админ платформы',
  },
  support: {
    id: '8c1dc25f-9a41-4b6e-b8ae-f5a11d0c6bd2',
    role_id: 'support',
    name: 'Поддержка',
  },
};
