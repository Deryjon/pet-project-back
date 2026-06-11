type ChildSpec = [
  string,
  string,
  string,
  string,
  string?,
  boolean?,
  string?,
  string?,
];
type PermissionSpec = [
  string,
  string,
  string,
  string,
  ChildSpec[]?,
  string?,
  boolean?,
  boolean?,
  string?,
  string?,
];
type SectionSpec = [string, string, number, PermissionSpec[]];

type PermissionChild = {
  id: string;
  parent_id: '';
  name: string;
  route: string;
  backend_route: string;
  http_method: string;
  description: string;
  is_active: boolean;
  slug: string;
};

type Permission = PermissionChild & {
  section_id: '';
  hide_from_ui: boolean;
  sequence_number: number;
  children: PermissionChild[];
};

const toChild = ([
  id,
  name,
  route,
  slug,
  description = name,
  isActive = true,
  backendRoute = '',
  httpMethod = 'ANY',
]: ChildSpec): PermissionChild => ({
  id,
  parent_id: '',
  name,
  route,
  backend_route: backendRoute,
  http_method: httpMethod,
  description,
  is_active: isActive,
  slug,
});

const toPermission = ([
  id,
  name,
  route,
  slug,
  children = [],
  description = '',
  isActive = true,
  hideFromUi = false,
  backendRoute = '',
  httpMethod = 'ANY',
]: PermissionSpec): Permission => ({
  ...toChild([
    id,
    name,
    route,
    slug,
    description,
    isActive,
    backendRoute,
    httpMethod,
  ]),
  section_id: '',
  hide_from_ui: hideFromUi,
  sequence_number: 0,
  children: children.map(toChild),
});

const sections: SectionSpec[] = [
  [
    '0626b5bf-a61a-4236-b838-f56414aa56f2',
    'products',
    0,
    [
      [
        '1a77751f-6c16-4566-8bd0-953e3647f82e',
        'Поставщики',
        'products/suppliers',
        'suppliers',
        [
          [
            '57c8c603-218e-4512-a05e-95ed3f446b53',
            'Возможность редактирования поставщиков',
            'products/suppliers/update/{:id}',
            'supplier-edit',
          ],
          [
            '055648ec-fc43-4a88-8fdd-440bb252c72e',
            'Возможность просмотра списка поставщиков',
            'products/suppliers',
            'supplier-list',
          ],
          [
            'e0aa19c3-a70b-4473-87a6-3832b4e41d21',
            'Возможность создания новых поставщиков',
            'products/suppliers/create',
            'supplier-create',
          ],
        ],
      ],
      [
        'ca32a386-b5f9-4e1c-b970-1f5cb1b9f51a',
        'Переоценка',
        'products/revaluation',
        'revaluation',
        [
          [
            '345e98b5-e8ce-4316-9572-e598d3a901ee',
            'Возможность одобрения переоценки',
            '/products/revaluation/view/{:id}',
            'revaluation-accept',
          ],
          [
            '0dfc88bd-3724-4e5b-9a95-7ed04c2374dd',
            'Возможность создания переоценки по курсу, марже и цене',
            'products/revaluation/create/:id',
            'revaluation-create',
          ],
          [
            '26962e98-41cd-4a2f-b123-9c0cb962a5bb',
            'Возможность переоценки по файлу',
            'products/revaluation/file',
            'revaluation-file',
          ],
          [
            '3080e176-3399-4749-a37e-1e5b89637d28',
            'Возможность просмотра процесса переоценок',
            'products/revaluation',
            'product-revaluation',
          ],
        ],
      ],
      [
        'f4e01baf-3f42-46e7-9143-cc88a65d2521',
        'Списание',
        'products/write-off',
        'write-off',
        [
          [
            '89e9ab5f-496b-4e88-8a8a-9ea60e59f7d2',
            'Возможность просмотра себестоимости списаний',
            'products/write-off/completed/?amount=0',
            'write-off-cost',
          ],
          [
            'a33ce177-dc42-43a2-a5db-6c6c2d13084d',
            'Возможность удаления процесса списаний',
            'products/write-off/cancel',
            'write-off-delete',
          ],
          [
            '3d7a3e9c-bdab-42fd-9292-500fa501eee6',
            'Возможность просмотра списка списаний',
            'products/write-off',
            'write-offs',
          ],
          [
            '61dcb752-551b-4aad-bd3a-f405b7a6798e',
            'Возможность создания списания',
            'products/write-off/create/:id',
            'write-off-create',
          ],
          [
            'cc280a6e-1882-41ef-a7ec-6d3d86674aa0',
            'Возможность завершения списаний',
            'products/write-off/finish/:id',
            'write-off-finish',
          ],
        ],
      ],
      [
        '2055a122-2b20-4479-b3c6-e0b4f38c1c4d',
        'Импорт',
        'products/import',
        'import',
        [
          [
            '90440f85-478d-4cdb-bf0f-c94ce03ccc15',
            'Возможность удаления импортов',
            'products/import/delete/:id',
            'import-delete',
          ],
          [
            '556a46e0-42bd-40bf-83e5-984c55c41260',
            'Просмотр процессов импорта',
            'products/import',
            'import-details',
          ],
          [
            '5b5bdc2c-873b-41ce-90fa-95e92cdd9d41',
            'Просмотр суммы продажи импортов',
            'products/import/list/?retail_price=0',
            'import-retail-price',
          ],
          [
            '4df2200c-eb8b-4399-aa6b-24c184ce122b',
            'Возможность проверки и загрузки импортов',
            'products/import/edit-access/:id',
            'import-check',
            '',
          ],
          [
            '9eca2438-fa7f-40d7-beb7-a7307606b656',
            'Просмотр суммы поставки импортов',
            'products/import/list/?price=0',
            'import-price',
          ],
          [
            'd6b65b39-9c0b-479a-9df6-d2778ee21e43',
            'Создание импортов',
            'products/import/create/:id',
            'import-create',
            '',
          ],
        ],
        'Тултип, объясняющий что делает cоздание товара, услуги, комплекта',
      ],
      [
        'f8235765-29d1-498a-be17-fd32461bd500',
        'Трансфер',
        'products/transfer',
        'transfer',
        [
          [
            'a6bb11ac-9474-41a2-b21d-e9a43df26d1d',
            'Возможность просмотра списка трансферов',
            'products/transfer',
            'transfers',
          ],
          [
            '2ed261c1-917b-4384-aeca-95b653cad2a3',
            'Возможность создавать трансферы',
            'products/transfer/create/:id',
            'transfer-create',
          ],
          [
            '2c9819a0-7c11-4707-aa61-388d43ca6a72',
            'Возможность принимать и проверять трансфер',
            'products/transfer/finish-access/:id',
            'transfer-check',
            '',
          ],
        ],
      ],
      [
        'ab205bbe-a4f6-477b-a930-3f8a7f73c2e2',
        'Заказы',
        'products/orders',
        'all-orders',
        [
          [
            'd61b97d4-bb98-4204-962c-9c87614942bc',
            'Возможность оплаты заказа',
            'products/orders/view/{:id}',
            'order-payment',
          ],
          [
            '69e9dd85-ab41-4f4a-a364-4c1775cffb9a',
            'Возможность создания заказа поставщику',
            'products/orders/create/{:id}',
            'order-create',
          ],
          [
            '7395d71a-9402-4520-8786-ccb651cba043',
            'Возможность приемки заказа',
            'products/orders/accept/{:id}',
            'order-accept',
          ],
          [
            'dbc21c99-48bf-48e4-b885-1fcea4a5463b',
            'Возможность просмотра заказа',
            'products/orders',
            'order-detail',
          ],
          [
            '9743a27a-654f-44e3-8f88-519e87cec6ea',
            'Возможность редактирования заказа',
            'supplier-order/update/',
            'order-edit',
          ],
          [
            'b677fdc5-4c03-4ccd-b936-da6828367fc0',
            'Возможность просмотра суммы заказа',
            'order-all-sum',
            'order-all-sum',
          ],
          [
            'b378b5b2-8bb6-4880-ada9-3af1cb38fa2f',
            'Возможность возврата заказа',
            'products/orders/return/{:id}',
            'order/return',
          ],
        ],
        'Заказы',
      ],
      [
        '058ef03a-df68-4c4f-812b-0eda26cea577',
        'Каталог',
        'products/catalog1',
        'catalog',
        [
          [
            '8a30a41d-b2bb-497d-a9c1-4522616f0a25',
            'Массовая печать ценников',
            '/products/bulk/price-tags',
            'bulk-price-tags',
          ],
          [
            '6b077305-9925-4aba-80c9-8d7a2f620205',
            'Редактирование цен и остатков товара, услуги, комплекта',
            'products/edit?balance=1&price=1',
            'product-price-edit',
            '',
          ],
          [
            'db7190af-390f-4822-94fe-40a528c1edaf',
            'Просмотр статистики каталога по товарам, услугам и комплектам',
            'products/catalog?statistics=0',
            'catalog-statistics',
            'Возможность просматривать статистику по остаткам и себестоимости',
          ],
          [
            '8e78ba06-c7da-45d5-89e8-f29c886fe514',
            'Массовое изменение свойств товаров',
            '/products/bulk/fields',
            'bulk-products-fields',
          ],
          [
            '55da1479-8a59-4c18-98fa-00521e8fff49',
            'Возможность просмотра цен поставки продуктов',
            'products/catalog?price=0',
            'product-supply-price',
            '',
          ],
          [
            'f27c7c8e-77b7-4df1-a10e-dd1a2ee4f6f5',
            'Создание товара, услуги, комплекта',
            'products/create',
            'product-create',
            'Возможность создавать товары, услуги и комплекты, а также устанавливать на них цены и остатки',
          ],
          [
            '3e6467da-8b0a-43a0-97b9-b563e5fc7d8a',
            'Редактирование фотографий товара, услуги, комплекта',
            'product/edit77',
            'product-photo',
            'Возможность добавлять и удалять фотографии товарам, услугам и комплектам',
          ],
          [
            '2f40fb6c-3a97-4b07-a01d-9b70bd40a592',
            'Массовая загрузка фотографий к товарам, услугам и комплектам',
            '/products/bulk/photo',
            'bulk-photo',
          ],
          [
            'ab3ad28e-8ef0-40a2-a9da-3c65c95e82c3',
            'Редактирование товара, услуги, комплекта',
            'products/edit',
            'product-edit',
            'Возможность менять описания и свойства товаров, услуг и комплектов',
          ],
          [
            'c9e3c56d-c942-44db-908b-2c15806da11e',
            'Просмотр и поиск товаров в каталоге',
            'products/catalog',
            'catalog-operations',
          ],
          [
            'c75c7885-88a5-463f-9c5d-268e863e24c4',
            'Настройка малого остатка к товарам',
            '/products/bulk/small_measurement_value',
            'small-quantity-products',
          ],
          [
            '2c6e2a42-2507-4a08-b31e-2a5ee652aef9',
            'Массовое изменение цены продажи на товары, услуги и комплекты',
            '/products/bulk/price',
            'price-edit',
          ],
          [
            '8c7cf86c-f7dd-41b8-a13a-a66430997780',
            'Возможность архивировать товары',
            '/products/bulk/archive',
            'product-bulk-archive',
          ],
          [
            'eaf024af-3aa7-49d3-a407-9060b3287979',
            'Возможность просмотра остатка всех магазинов',
            'catalog/products',
            'product-list',
          ],
          [
            'a01e86a4-122a-41e4-b1fc-0c8007b0da00',
            'Возможность выгружать Каталог в Excel',
            'v2/product-excel-export',
            'product-excel-export',
            '',
          ],
        ],
        'Тултип, объясняющий что делает cоздание товара, услуги, комплекта',
      ],
      [
        '4fb43718-80a4-4e91-8863-b71726266a53',
        'Инвентаризация',
        'products/inventory',
        'inventory',
        [
          [
            '2206f907-5750-4316-9b38-5a91bd704eb0',
            'Возможность блокировать процесс инвентаризации',
            'products/inventory/block/:id',
            'inventory-block',
          ],
          [
            '8ca82fd9-eb98-4ec4-bf20-68be02a00e39',
            'Возможность просмотра списка инвентаризаций',
            'products/inventory',
            'inventory-list',
          ],
          [
            '41ca52a3-332a-4d38-9c3a-cc3bbd625f1a',
            'Возможность просматривать результаты инвентаризации',
            'products/inventory/result/:id',
            'inventory-result',
          ],
          [
            'cf463103-c0b0-43b5-b7f7-efe70aa0675b',
            'Возможность завершать инвентаризацию',
            'products/inventory/result/:id?canfinish=1',
            'inventory-finish',
          ],
          [
            'a0d0136a-9542-4ee9-aa35-7f025856794b',
            'Возможность удалять незавершенную инвентаризацию',
            'products/inventory/delete/:id',
            'inventory-delete',
          ],
          [
            '549a9842-5e89-4237-918c-cd947423b993',
            'Возможность просматривать заявленные товары к инвентаризации',
            'products/inventory/?declared=1',
            'inventory-declared',
          ],
          [
            '255baed4-87a6-46fe-ac0b-cdf9289eb7c6',
            'Возможность создания полной инвентаризации',
            'products/inventory/create/:id',
            'inventory-create',
          ],
          [
            'b7a31773-7f87-4dc5-97b8-c758b8ce4ea2',
            'Возможность создания частичной инвентаризации',
            'products/inventory/?partial=1',
            'inventory-partial',
          ],
        ],
        'Тултип, объясняющий что делает cоздание товара, услуги, комплекта',
      ],
      [
        '5a71b9d0-9d97-46e9-8265-c0cfbf15a57e',
        'Справочник',
        'products/handbook',
        'handbook',
        [],
        'Тултип, объясняющий что делает cоздание товара, услуги, комплекта',
      ],
    ],
  ],
  [
    'e00c4747-5ccf-43ab-9433-588be3d00005',
    'sales',
    1,
    [
      [
        '94de2e86-e3c2-44f1-915c-8fab9a87a1a5',
        'Новая продажа',
        'order/create',
        'new-sale',
        [
          [
            'f5897673-cab9-4b60-807a-eec4a3220986',
            'SMS авторизация клиента только для активации скидки и снятия средств с баланса',
            'order/sms-auth-cashback-withdrawal',
            'order-assign-client-sms-auth-cashback-withdrawal',
            undefined,
            false,
          ],
          [
            'e2312673-cdb9-4b60-807a-eec4a3220986',
            'Управление функцией "Продажа в минус"',
            'order/controlling_negative_sales',
            'controlling_negative_sales',
          ],
          [
            '047ee2cc-5fcf-4a9d-b8f0-1f49d9bd297c',
            'Возможность делать ручные скидки на чек и товар',
            'new-sale/discount',
            'manual-discount',
          ],
          [
            'ae881f75-5f51-47bb-a9ce-cff1f4d7c77f',
            'Возможность делать возвраты и обмены',
            'order/new-order/return/:id',
            'order-return',
          ],
          [
            '83ef1b26-281c-4beb-9176-0d5b962068f5',
            'Возможность делать транзакции продаж',
            'order/create',
            'order-new',
          ],
          [
            '66aa2275-d251-4d91-9c62-25da8ab733cd',
            'Возможность осуществления продажи в долг',
            'order/new-order/{:id}',
            'order-debt',
          ],
          [
            '439f08cd-e3ce-4a92-80c8-f85695f3170b',
            'Возможность завершать отложки',
            'order/new-order/draft/:id',
            'delay-finish',
          ],
          [
            'f851718a-527b-40e5-b298-c3bf86ad25bc',
            'Возможность осуществлять возврат с другого магазина',
            '/new-order/return-from-other-shop',
            'return-from-another-store',
          ],
          [
            'bad024af-3aa7-49d3-a407-8060b3285973',
            'Отображать в списке продавцов',
            'order/seller-list',
            'seller-list',
          ],
          [
            '8e0be3a8-b903-4f5a-afc4-df9484fe05d3',
            'SMS авторизация клиента для активации скидки, начисления и снятия средств с баланса',
            'order/sms-auth',
            'order-assign-client-sms-auth',
            undefined,
            false,
          ],
        ],
      ],
      [
        '77792139-fa18-4ff0-98ef-9e35ada59daa',
        'Все продажи',
        'order/all',
        'all-sales',
        [
          [
            'e2217673-cab9-4b60-807a-eec4a3220986',
            'Просмотр удалённых продаж',
            'order/show_deleted_orders',
            'show_deleted_orders',
          ],
          [
            '6d8e1520-7af2-4ddf-a09c-038cb116a9f4',
            'Возможность печати отчета',
            'order/all/print',
            'report-print',
          ],
          [
            '4399c77e-511a-4973-b456-1405f9b05914',
            'Возможность удаления завершенной транзакции',
            'order/delete/:id',
            'order-delete',
          ],
          [
            '6cdafcdf-2d7c-4fa5-a101-3c8d53992f0a',
            'Возможность редактирования даты оплаты в завершенной транзакции',
            'order/edit/date/:id',
            'order-date',
          ],
          [
            'dfcbb7e2-dc17-4a71-bc30-8ab83d06d209',
            'Возможность просмотра списка транзакций в других магазинах',
            'order/all/shops',
            'orders-other-shops',
            '',
          ],
          [
            'e3e6dc0c-3d83-4e40-b92e-215cba26cf3d',
            'Возможность редактирования клиента в завершенной транзакции',
            'order/edit/client/:id',
            'order-client',
          ],
          [
            '84a7ad38-96ee-4e2f-a7ce-9224f6048cb6',
            'Возможность редактирования продавца в завершенной транзакции',
            'order/edit/seller/:id',
            'order-seller',
          ],
          [
            'dbcb6b68-184f-40ea-aba8-51a647990ebd',
            'Возможность редактирования типов оплат в завершенной транзакции',
            'order/edit/type/:id',
            'payment-type',
          ],
          [
            '425386cf-d51d-4fcf-b217-d62e0f085f1f',
            'Возможность просмотра списка транзакций за весь период',
            'order/bro',
            'orders',
          ],
          [
            'ebd024af-3aa7-49d3-a407-8060b3285973',
            'Просмотр продаж всех продавцов',
            'order/all-sales',
            'show-all-sales',
            'Когда роль включена, в модуле “Все продажи” отображаются продажи всех продавцов. При отключенной роли видны только собственные продажи',
          ],
        ],
      ],
      [
        'b5ade22b-d749-4df7-943a-9c130e033e2a',
        'Кассовые смены',
        'order/cash-shifts',
        'cash-shifts',
        [
          [
            '672ab3d9-a631-44c6-bf2c-410427579a00',
            'Возможность открытия и закрытия кассовой смены',
            'order/cash-shifts/close',
            'cashbox-shifts',
          ],
          [
            'bf906504-0063-4c21-abc5-eb6dc79c084e',
            'Возможность создавать внесения, при открытии кассовой смены',
            'order/cash-shifts/edit',
            'cashbox-open-edit',
            '',
          ],
          [
            'f629b948-c523-46f4-a444-18a7992dd09e',
            'Возможность просмотра кассовых смен',
            '---',
            'cash-shifts-detail',
          ],
        ],
      ],
      [
        '8850ca60-1050-40bd-81ec-8d95f47a03bc',
        'Кассовые операции',
        'order/cashbox-operations',
        'cashbox-operations',
        [
          [
            '771aedf9-a745-4644-9695-9f772c834271',
            'Произвести операцию смены кассы или безнал в кассовой операции',
            'order/cashbox-operations/manager',
            'cashbox-change',
            '',
          ],
          [
            '8cf09044-e011-43c6-92ad-aa3b7ead076f',
            'Возможность создавать инкассацию по доступной кассе',
            'gl-transaction',
            'gl-transaction-collection',
          ],
          [
            '251f15aa-1c49-40f4-b46d-ee2c71e70a5f',
            'Возможность создавать доходы по доступным категориям на кассе',
            'gl-transaction',
            'gl-transaction-income',
          ],
          [
            '77e1d1eb-85b6-4037-8fd5-467126ab8b7b',
            'Возможность создавать расходы по доступным категориям на кассе',
            'gl-transaction',
            'gl-transaction-cost',
          ],
          [
            '7fe1d2dc-279e-4221-918a-cd16e3fe7188',
            'Возможность просмотра истории кассовых расходов и доходов',
            'order/cashbox-operations',
            'gl-transaction-view',
          ],
        ],
        'Произвести операцию смены кассы или безнал в кассовой операции',
      ],
    ],
  ],
  [
    'c2267912-bcbf-4a1b-a572-753dd242bb3c',
    'clients',
    2,
    [
      [
        '39d322cf-1075-4e27-8840-dd878541c4dc',
        'Долги клиентов',
        'clients/debts',
        'debts',
        [
          [
            '40dc6fbc-bf5d-4456-b33a-8d0d0b53b263',
            'Возможность просмотра транзакций долгов',
            'clients/debts',
            'debt-detail',
          ],
          [
            'bb98cb0f-3a78-4c0b-8e90-c5535dadcebb',
            'Возможность погашения транзакции долга',
            'client/debts',
            'debt-cancel',
          ],
          [
            '0a0c7046-10ad-45f4-926a-5c69c6be5b3d',
            'Возможность редактирования транзакции долга',
            'clients/debts/edit/:id',
            'debt-edit',
          ],
        ],
      ],
      [
        'a734891d-272f-47fe-a9d4-2168c4eef268',
        'Все клиенты',
        'clients',
        'all-clients',
        [
          [
            '39ec2725-a0fe-4c77-b827-98926d7994c3',
            'Возможность удаления клиента',
            'client-delete',
            'client-delete',
            '',
            true,
            '/v1/customer/:id',
            'DELETE',
          ],
          [
            '7b88dcdd-de21-4273-96ea-43093518f456',
            'Возможность скачивания списка клиентов',
            'clients/download',
            'clients-download',
          ],
          [
            '4b97f975-bdaf-4f18-a6cc-0d3a16cbcfde',
            'Возможность редактирования баланса клиента',
            'customer/update-balance',
            'balance-edit',
          ],
          [
            'f2331d43-1b3f-4495-9c05-1c9f2e0e8dad',
            'Возможность просмотра деталей клиента',
            'clients/client-card/:id',
            'client-card',
          ],
          [
            'a3d208da-5898-497c-820a-7a652d2afc53',
            'Возможность просмотра списка клиентов',
            'clients',
            'clients',
          ],
          [
            'b925cd1f-807f-41ac-b4d0-623c5d6ab42b',
            'Возможность редактирования карточки клиента',
            'clients/client-card/edit/:id',
            'client-card-edit',
          ],
        ],
      ],
      [
        '75674884-2046-4e31-bfd6-31efc8334138',
        'Программа лояльности',
        'loyalty-program',
        'loyalty-program',
        [
          [
            '1f29b127-09db-41f7-94a9-51fe7cd2e6b5',
            'Возможность редактирования программы лояльности',
            'clients/loyalty-program/edit/:id',
            'loyalty-edit',
          ],
          [
            'e7347bb9-4b22-4e01-beca-5b9a1e4eadd1',
            'Возможность создания программы лояльности',
            'clients/loyalty-program/create',
            'loyalty-create',
          ],
          [
            '29de2c73-2eec-421c-b556-4e1950e3e51f',
            'Возможность просмотра настроек программы лояльности',
            'clients/loyalty-program',
            'loyalty-setting',
          ],
        ],
      ],
      [
        'a93e998c-fee0-4116-8a36-490eebb7a99f',
        'Группы клиентов',
        'clients-group',
        'clients-group',
        [
          [
            'db5cf817-f632-4587-bb89-a6431d1927cf',
            'Возможность создания групп и тегов',
            'clients/clients-group/create',
            'group-create',
          ],
          [
            '03c12a78-49ee-4103-8b5d-6d1423d46747',
            'Возможность редактирования групп и тегов',
            'clients/clients-group/edit/:id',
            'group-edit',
          ],
          [
            '2a999d89-4276-4426-835d-819cd2a992cc',
            'Возможность просмотра списка групп и тегов',
            'clients/clients-group',
            'group-list',
          ],
        ],
      ],
    ],
  ],
  [
    'a154ad91-7fbf-4413-ac7e-bf4de005444b',
    'marketing',
    3,
    [
      [
        '8f35218c-9a9e-48b3-be04-391e6fe1bc7d',
        'Акции',
        'promos',
        'promos',
        [
          [
            'ec52108b-4e5b-4398-80bf-4904192d8c8f',
            'Редактирование акции',
            'promo/edit',
            'promo-edit',
          ],
          [
            'f1b996fb-5cae-4528-8a2f-532799d579f3',
            ' Просмотр страницы',
            'marketing/promotions',
            'promo',
          ],
          [
            '158f0285-0878-4136-86f4-5dfe1337255f',
            'Создание акции',
            'promo/create',
            'promo-create',
          ],
          [
            'c50f7266-5666-4eee-bf7d-1feade6e45bc',
            'Остановка/Возобновление акции',
            'promo/action',
            'promo-action',
          ],
          [
            '1366b5f9-1b28-40c7-b198-508c6fa9699e',
            'Удаление акции',
            'promo/delete',
            'promo-delete',
          ],
        ],
        'Акции',
      ],
      [
        '264c8cda-64c6-497b-bff3-eea75f561f43',
        'SMS рассылка',
        'marketing/sms-mailing',
        'sms',
        [
          [
            '45fea56b-a022-4eaf-b53c-b86a7a96630a',
            'Создание новой рассылки',
            'sms/mailing/create',
            'sms-create',
          ],
          [
            '94182e43-1684-4fd3-8537-dcdf55b22b04',
            'Просмотр страницы',
            'marketing/sms-mailing',
            'sms-view',
          ],
        ],
      ],
      [
        'c8409945-8595-44b2-b89c-1a9d5cd64ed5',
        'Подарочные карты',
        'marketing/gift-cards/tutorial',
        'gift-cards',
        [
          [
            '50c9c82e-3081-4677-a9a8-8f9246d75e01',
            'Возможность оплаты подарочными картами',
            'gift-card-payment',
            'pay-gift-card',
          ],
          [
            '9eee99cd-7d2c-41c3-aee3-9db90f6ecc24',
            'Возможность продажи подарочных карт в новой продаже',
            'gift-card-sale',
            'sell-gift-card',
          ],
          [
            '97004b5e-9aaa-4021-83fa-764baa841887',
            'Возможность просмотра страницы подарочных карт',
            'marketing/gift-cards/tutorial',
            'view-gift-card',
          ],
        ],
        'Подарочные карты',
      ],
      [
        'b77dff60-e4ec-4689-ace6-1fbbd4e1d967',
        'Промокоды',
        'marketing/promo-codes',
        'marketing-promo-code',
        [],
        'Промокоды',
      ],
    ],
  ],
  [
    '4519bd93-fdbc-428f-8010-6da882f0fd84',
    'reports',
    4,
    [
      [
        '0ba88835-ec69-4d3e-9fd9-7aa0c824719f',
        'Магазин',
        'reports/shop',
        'reports-shop',
        [
          [
            '87d353e8-a7ba-4f3e-9249-99a406989342',
            'Отчет "Сводный"',
            'reports/shop/summary',
            'reports-shop-summary',
            '',
          ],
          [
            '6d9585ed-7f71-4004-8be8-aba750191592',
            'Отчет "Транзакции"',
            'reports/shop/transactions',
            'reports-shop-transactions',
            '',
          ],
          [
            'b80ef171-4dca-4185-a27c-0cf520405096',
            'Сводный отчет',
            '**-reports/shop',
            'summary-report',
          ],
        ],
        'Магазин',
      ],
      [
        '45a779cc-314e-4bda-8b8a-51851374bce5',
        'Товары',
        'reports/products',
        'report-products',
        [
          [
            '44a071dc-65d2-44f4-ade8-a402ec49eb21',
            'Отчет "Продажи по товарам"',
            'reports/products/summary',
            'reports-products-summary',
            '',
          ],
          [
            '560797cb-0cb8-48bc-ac3b-62b81c4ae267',
            'Отчет "Продажи по поставщикам"',
            'reports/products/supplier',
            'reports-products-supplier',
            '',
          ],
          [
            'fcbfe72a-ba5e-4139-9563-c80a0cab8485',
            'Отчет "Эффективность товаров"',
            'reports/products/efficiency',
            'reports-products-efficiency',
            '',
          ],
          [
            '851d5795-8ebd-4692-bbfd-3f8b0fdb06e9',
            'Отчет по остаткам',
            'reports/products/leftover',
            'reports-products-leftover',
            '',
          ],
          [
            'd31738a3-c1ef-429d-a561-d510b8242f99',
            'Отчет "Импорты"',
            'reports/products/import',
            'reports-products-import',
            '',
          ],
          [
            '0e67a8d0-858a-42f1-899b-72e06b42b82a',
            'Продажи товаров',
            'deleted-reports/products',
            'report-product',
          ],
          [
            'e92fc855-79c8-47fd-86b5-d7cad7504637',
            'Отчет "ABC-сегментация"',
            'reports/abc-segmentation',
            'report-abc-segmentation',
          ],
          [
            'daf24a77-635e-4edc-a78e-6255954ccc86',
            'Отчет "Списания"',
            'reports/writeoff',
            'report-write-off',
          ],
          [
            '73d1b26f-3f00-4f0d-87e6-54a97378e600',
            'Отчет "Итоги инвентаризации"',
            'reports/stocktaking',
            'report-stocktaking',
          ],
          [
            'd1ee6597-a64b-4b27-8447-2423743dcd8c',
            'Отчет "Возвраты заказов"',
            'reports/supplier-order-return',
            'report-supplier-order-return',
          ],
        ],
      ],
      [
        '399d7743-c073-478a-afb6-5939c9299d4a',
        'Избранные',
        'reports/favorites',
        'favourites',
      ],
      [
        'aa0dc56a-979d-49ff-bbc9-abf007b3e0ca',
        'Клиенты',
        'reports/clients',
        'report-clients',
        [
          [
            'fb201c89-e47b-4bea-b2fc-bd5031734096',
            'Отчет "Покупки клиентов"',
            'reports/clients/purchases',
            'reports-clients-purchases',
            '',
          ],
          [
            '68891c0f-1db3-4043-960a-574b337b8abf',
            'Отчет "Клиенты"',
            'reports/clients/summary',
            'reports-clients-summary',
            '',
          ],
          [
            'e899ad74-ff43-47be-a075-41b70a70b79e',
            'Продажи по клиентам',
            'deleted-reports/clients',
            'report-client',
          ],
        ],
      ],
      [
        'c7ea757e-25f4-47dc-ab6a-989fb85d0258',
        'Финансы',
        'reports/finances',
        'report-finance',
        [
          [
            'b6e53d08-4155-4caf-b324-18a9b564cb9a',
            'Отчет "Финансовые транзакции"',
            'reports/finances/movements',
            'reports-finances-movements',
            '',
          ],
          [
            '1fc363bf-25c6-426c-8dd9-ea818c0784b1',
            'Отчет "Прибыли и убытки"',
            'reports/finances/summary',
            'reports-finances-summary',
            '',
          ],
          [
            '958cad3c-a8f4-47ed-9c85-ac216e1ea4bf',
            'Прибыль и убытки',
            'deleted-finance/report',
            'finance-report',
          ],
        ],
      ],
      [
        '49ab119a-6e66-4ae5-95ec-ef3238654620',
        'Продавцы',
        'reports/sellers',
        'report-sellers',
        [
          [
            'a922c8d4-1fc8-4ff5-ae3b-a984393342ad',
            'Продажи по продавцам',
            'reports/report-seller',
            'report-seller',
          ],
          [
            '3f80fa90-a7f5-43b2-8095-188ec3354dda',
            'Продажи товаров',
            'reports/sellers/products',
            'report-seller-products',
          ],
        ],
      ],
      [
        '8b3868eb-e57a-4f40-9458-7189a9b8c55c',
        'Мои отчеты',
        'deleted-reports/my',
        'my-reports',
      ],
      [
        '96dc018c-ca86-471e-9f4f-fd44519f0c9d',
        'Возможность скачивать отчет по продажам',
        '/v1/transaction-report-by-products-excel',
        'transactions-report',
      ],
    ],
  ],
  [
    'a64023cc-f96e-4d95-abb3-f5fd8fca01c0',
    'finance',
    5,
    [
      [
        '4b60e335-dc6b-405a-be77-56a317e90490',
        'Состояние счетов',
        'finance/state',
        'finance-state',
        [
          [
            '1c18164c-2c9c-41a5-aa93-80b92bb229db',
            'Возможность просмотра состояния счетов',
            'finance/state',
            'state-view',
          ],
        ],
        'Состояние счетов',
      ],
      [
        '4afe6c34-6404-4105-8945-1a1f9d3db10f',
        'Финансовые категории',
        'finance/categories',
        'categories',
        [
          [
            'bc40a294-5bc2-4d03-9ba2-45520b4ab73b',
            'Возможность просматривать категории доходов и расходов',
            'finance/categories',
            'category-detail',
          ],
          [
            '9f6a5536-3d74-4964-b0f8-fffb8bc49821',
            'Возможность объединять категории доходов и расходов',
            'account/merge',
            'category-merge',
          ],
          [
            '2c76d67b-11af-48a9-9150-b771ef9bfd1c',
            'Возможность удалять категории доходов и расходов',
            'finance/categories/delete',
            'category-delete',
          ],
          [
            'abcf3b9e-2c7c-42c6-8d69-b1108ba8e578',
            'Возможность создавать категории доходов и расходов',
            'finance/categories/create',
            'category-create',
          ],
        ],
        'Финансовые категории',
      ],
      [
        '77d13445-4527-4f12-9e2a-e43d46ca14b1',
        'Финансовые транзакции',
        'finance/transactions',
        'transactions',
        [
          [
            'fc02fb88-1da4-4422-bb06-6ee15777392a',
            'Возможность просматривать транзакции доходов, расходов, конвертации и перемещений ',
            'finance/transactions',
            'transactions-view',
          ],
          [
            '56d1990f-6326-421a-b4e5-a015babb3846',
            'Возможность проверять и принимать закрытые кассовые смены ',
            'finance/transactions/view',
            'transactions-check',
          ],
          [
            'ae7d5bff-0667-457c-8f87-46eb099b9f08',
            'Возможность создавать транзакции доходов, расходов, конвертации и перемещений',
            'finance/transactions/create',
            'transactions-create',
          ],
        ],
        'Финансовые транзакции',
      ],
    ],
  ],
  [
    'a27b7379-31e8-4574-82a1-3be4cdb00d81',
    'settings',
    6,
    [
      [
        '9ddfee73-eed6-4ea2-ac45-d24a1d44fc65',
        'товары',
        'settings/product',
        'settings-products',
        [
          [
            '629880b2-cad2-40cc-8fc7-916f71c40fc6',
            'Возможность добавления дополнительных характеристик к товару',
            'settings/additional/create',
            'characteristics-create',
          ],
          [
            'c1c6d506-eaa4-491c-bae8-3d607a74b9d8',
            'Возможность редактирования дополнительных характеристик к товару',
            'settings/additional/edit/:id',
            'characteristics-edit',
          ],
          [
            '1ac15b2b-faf1-4f0d-81f4-1cd5a7d8a2f9',
            'Возможность добавления единицы измерения',
            'settings/product/create',
            'measurement-create',
          ],
          [
            '73d70c18-5ac2-45de-8497-38e6d72cb920',
            'Возможность редактирования единицы измерения',
            'settings/product/edit/:id',
            'measurement-edit',
          ],
          [
            '3c097ac0-5702-445b-9d35-b271da87e980',
            'Возможность просмотра информации о товарах',
            'settings/product',
            'settings-product',
          ],
        ],
      ],
      [
        'c687338d-f0e4-4309-bd88-db9dfa4ab0f1',
        'Профиль',
        'settings/profile',
        'settings-profiles',
        [
          [
            'f6d87c09-d2e1-4b29-8ed1-59e1f1f33b45',
            'Управление своими сессиями',
            'settings/profile/sessions',
            'settings-session',
          ],
          [
            '0aacb736-9b34-4676-a3ba-2d476a434dc3',
            'Возможность редактирования профиля',
            'settings/profile',
            'settings-profile',
          ],
        ],
      ],
      [
        '2d1161c5-9616-4dce-8ff1-710a6d58758a',
        'Уведомления',
        'settings/notification',
        'notifications',
        [
          [
            'caba46d8-308f-4cff-bafb-da22f75713c0',
            'Уведомления в системе',
            'settings/notification/system',
            'notification-view',
          ],
          [
            '05a937a8-1060-49ee-9791-5200e271d10f',
            'Telegram-бот',
            'settings/notification/telegram',
            'telegram-notification',
          ],
          [
            '34c93817-b256-4985-923e-a3d61e9e921e',
            'Уведомления по SMS',
            'settings/notification/sms',
            'sms-notification',
          ],
          [
            '235408fb-9772-4d94-ae2f-949ce603fd51',
            'Уведомления по почте ',
            'settings/notification/email',
            'mail-notification',
          ],
        ],
        'Уведомления',
      ],
      [
        'ae8659f5-7b92-4c0d-a889-f2a356165bb1',
        'Компания',
        'settings/company',
        'settings-company',
        [
          [
            '2a243539-b677-4b71-8bbf-93f87975845b',
            'Возможность изменения ссылки для входа',
            'settings/company/subdomen',
            'change-subdomen',
          ],
          [
            'cf22a739-abab-4a9c-afbe-f5f367a9c877',
            'Возможность редактирования настроек Компании',
            'settings/company',
            'company-edit',
          ],
        ],
      ],
      [
        '85740534-a567-4efc-803b-1f9d08c35389',
        'Магазины',
        'settings/shop',
        'settings-shop',
        [
          [
            '5d4bbb00-227e-4241-b331-2d11c8290477',
            'Возможность редактирования магазинов',
            'settings/shop/:id',
            'shop-edit',
          ],
          [
            'ea71f2f8-12b7-478c-9bde-ac0799d62d7a',
            'Возможность просмотра списка магазинов',
            'settings/shop',
            'shop-list',
          ],
          [
            '0ac8b254-958f-4cb9-9f44-dffa91786018',
            'Возможность создания нового магазина',
            'settings/shop/create',
            'shop-create',
          ],
          [
            'a6c40b2d-7b43-4b89-acc1-bf79708697f5',
            'Возможность удаления магазинов',
            'settings/shop/delete/:id',
            'shop-delete',
          ],
        ],
      ],
      [
        '4778631c-abe1-4730-94d1-5655dfa6c5ee',
        'Кассы',
        'settings/cashbox',
        'settings-cashbox',
        [
          [
            'f1675e74-4750-4213-95fe-b2d7f61ae01b',
            'Возможность редактирования касс',
            'settings/cashbox/:id',
            'cashbox-edit',
          ],
          [
            'f6797b6d-4c48-427e-a98d-bfaa9415152b',
            'Возможность просмотра списков касс',
            'settings/cashbox',
            'cashbox-list',
          ],
          [
            'a174fb9d-e83c-4dcd-a632-2fad82e06e66',
            'Возможность удаления касс',
            'settings/cashbox/delete/:id',
            'cashbox-delete',
          ],
          [
            '94adb6d1-e7b1-4ef3-bd00-f5a28aa2b233',
            'Возможность создания новой кассы',
            'settings/cashbox/create',
            'cashbox-create',
          ],
        ],
      ],
      [
        '4513755c-a53c-4491-ab97-6140e66a722d',
        'Чеки',
        'settings/cheque',
        'settings-cheque',
        [
          [
            'f54cd34b-418d-4b07-9d1b-875d8f53f5cd',
            'Возможность удаления чеков ',
            'settings/cheque/delete/:id',
            'cheque-delete',
          ],
          [
            'ee1d1439-7555-4c2a-9440-f667fdfacbce',
            'Возможность редактирования чека',
            'settings/cheque/edit/:id',
            'cheque-edit',
          ],
          [
            '979131d7-2f86-491d-92b2-b0ca5f87c26d',
            'Возможность просмотра списка чеков',
            'settings/cheque',
            'cheque-list',
          ],
          [
            '8a1fbc00-249f-4dae-9b53-11da7e6b5099',
            'Возможность создания нового чека',
            'settings/cheque/create',
            'cheque-create',
          ],
        ],
      ],
      [
        '043ec528-b8a8-4ce4-a74b-67557182ade8',
        'Валюты и оплаты',
        'settings/payment',
        'settings-payment',
        [
          [
            '25bd29e2-9f0d-4c19-9456-3b1f271e3a33',
            'Возможность редактирования типа оплаты ',
            'payment-type/edit',
            'payment-type-edit',
          ],
          [
            '68be699e-2d12-4885-bde0-ccc124521d37',
            'Возможность просмотра списков валют',
            'settings/payment/currency',
            'currency-list',
          ],
          [
            '8a89e437-0241-44e3-9438-47d76976e1d7',
            'Возможность удаления валюты',
            'settings/payment/currency/delete',
            'currency-delete',
          ],
          [
            '09f6f514-048b-483b-8d7d-8fd0da6e8b27',
            'Возможность добавления новой валюты',
            'settings/payment/add',
            'currency-create',
          ],
          [
            '6f013dbe-3820-4338-a3ec-7383ca0f3322',
            'Возможность изменения курса валют',
            'settings/currency/edit',
            'currency-edit',
          ],
          [
            '5a086878-d7b6-48b2-b003-4f84536cacb3',
            'Возможность просмотра типов оплат',
            'settings/payment/types',
            'payment-types',
          ],
          [
            'd5ad04b4-28d2-4b31-8d52-f32375e66afc',
            'Возможность удаления типа оплаты',
            'payment-type/delete',
            'payment-type-delete',
          ],
          [
            'e1a41797-1629-46f0-977f-9b2536d89ed2',
            'Возможность добавления типа оплаты ',
            'payment-type/create',
            'payment-type-create',
          ],
        ],
      ],
      [
        '4dc236c8-6c6e-4b08-a960-8b7cb13e4666',
        'Тарифы',
        'settings/plan',
        'plan',
        [
          [
            '6b4c90ff-b406-4be5-a070-da7b40328819',
            'Просмотр информации о тарифе',
            'settings/plan',
            'plan-info',
            '',
          ],
          [
            'af4f827d-780d-4491-8de1-d157e56bb400',
            'Просмотр информации об истории оплат',
            '/plan-payment-history',
            'plan-payment-history',
            '',
          ],
          [
            'cc178185-6acd-47e4-9400-af217986992a',
            'Просмотр информации об инвойсах',
            'reports/plan-invoice',
            'plan-invoice',
            '',
          ],
          [
            '9bebe6ba-d7df-4491-b8ec-b96fa7280944',
            'Возможность изменения тарифа',
            '/plan-change',
            'plan-change',
            '',
          ],
          [
            '354b9faa-5180-44e5-8744-60238d45c40c',
            'Возможность пополнения баланса',
            '/plan-payment',
            'plan-payment',
            '',
          ],
        ],
      ],
      [
        '958778fa-ef83-49fb-b944-419132dd75d8',
        'Приложения',
        'settings/applications',
        'settings-applications',
        [
          [
            '89234a68-3390-4f0c-a846-d0d497a9dc40',
            'Создание и управление клиентским ботом',
            'settings/applications/shop-bot',
            'shop-bot',
          ],
        ],
        'Модуль приложения для подключения интеграций',
      ],
      [
        'ba7075a1-f724-45a9-88c9-45fe702c0f35',
        'Просмотр и управление ключами интеграций',
        '/settings/integrations',
        'create-integrated',
        [],
        'Дает доступ на просмотрт, создание, удаление пользователей api интеграции',
      ],
    ],
  ],
  [
    '19b01a2d-e91e-4e45-bb74-b832405d8cab',
    'management',
    7,
    [
      [
        'f1117673-cab9-4b60-807a-eec4a3220986',
        'Просмотр список компаний с программой лояльности',
        'order/show_loyalty_companies',
        'show_loyalty_companies',
        [],
        'Просмотр список компаний с программой лояльности',
        false,
        true,
        '/v1/ext-loyalty/companies',
      ],
      [
        'f1678fb3-ecbe-49a6-950f-6cfb86756472',
        'Сотрудники',
        'management/employees',
        'employees',
        [
          [
            '23f6baf5-ffc7-45e0-9059-55035e1b19bd',
            'Управление сессиями сотрудников',
            'employees/update',
            'employee-session-management',
            'Управление сессиями - настройка лимитов, закрытие действующих сессий у других пользователей',
          ],
          [
            'e6955a19-f0e2-462f-8e93-eb61e4dd4b9e',
            'Возможность создания новых сотрудников',
            'management/employees/create',
            'employee-create',
          ],
          [
            '29f71763-fe3f-4af5-b4d2-73c98531cd58',
            'Возможность удаления сотрудников',
            'management/employees/delete/:id',
            'employee-delete',
          ],
          [
            '434dcea4-574c-4f0f-932f-474c9a5983a9',
            'Возможность редактирования сотрудника',
            'user/{id}',
            'employee-edit',
          ],
          [
            'ee862482-ea1f-464f-b765-375ceb86512b',
            'Возможность блокирования сотрудников',
            'management/employees/block/:id',
            'employee-block',
          ],
          [
            'dd85ad8a-7fe5-401d-a990-1b5e576eec08',
            'Возможность просмотра списка сотрудников',
            'management/employees',
            'employee-list',
          ],
        ],
        'Management',
      ],
      [
        '2127a4a0-eda5-4ec0-b736-ee2eb255873f',
        'Роли',
        'management/roles',
        'roles',
        [
          [
            'b4ab0d5c-e9bc-4f60-9cf3-f9ce771e612d',
            'Возможность просмотра списка ролей',
            'management/roles',
            'role-list',
          ],
          [
            'b2b25861-0cfe-420c-893f-78eaac9db29b',
            'Возможность удаления роли ',
            'management/roles/delete',
            'management-role-delete',
          ],
          [
            '0597c8c4-e31d-4a91-982f-bfbc9897b16c',
            'Возможность редактирования роли',
            'management/roles/:id',
            'role-edit',
          ],
          [
            '1721db3c-ad09-4303-a0c1-06b7fb8a6fad',
            'Возможность создания новой роли',
            'management/roles/create',
            'role-create',
          ],
          [
            '1a243539-b677-4b70-8bbf-93f87975845b',
            'Автосинхронизация движений',
            'management/product-movements-autofix',
            'product-movements-autofix',
            undefined,
            false,
          ],
        ],
      ],
    ],
  ],
  [
    '028b7298-cf0e-4714-9141-c3025a6d42a2',
    'dashboard',
    8,
    [
      [
        'fc3f810f-8cdd-4429-927b-70f934791664',
        'Просмотр дашборда по продажам магазина',
        'dashboard/access',
        'dashboard-orders',
        [],
        'Просмотр дашборда по продажам магазина, к которому привязан',
      ],
      [
        '0581c1bd-2925-4014-bb63-dabc7ae81b8f',
        'Возможность создания и управления таргетами',
        'dashboard/target',
        'target',
        [],
        'Возможность создания и управления таргетами',
      ],
    ],
  ],
  [
    'dea657b7-804f-4703-bd99-be7ec6a07144',
    'epos',
    9,
    [
      [
        '02d2b5e1-64d9-4ef3-9d49-8849d7d95183',
        'Автоматический фильтр для транзакций сделанных через E-POS',
        'orders-epos',
        'orders-epos',
        [],
        'Автоматический фильтр для транзакции сделанные через E-POS',
        false,
      ],
    ],
  ],
];

export const ROLE_PERMISSIONS_PAYLOAD = {
  sections: sections.map(([id, key, sequence_number, permissions]) => ({
    id,
    key,
    sequence_number,
    permissions: permissions.map(toPermission),
  })),
  user_id: '',
};

export const ROLE_PERMISSION_SECTIONS = ROLE_PERMISSIONS_PAYLOAD.sections;

const PERMISSION_IDS_BY_SLUG = new Map<string, string[]>();

for (const section of ROLE_PERMISSION_SECTIONS) {
  for (const permission of section.permissions) {
    const permissionSlug = permission.slug.trim().toLowerCase();
    PERMISSION_IDS_BY_SLUG.set(permissionSlug, [
      ...(PERMISSION_IDS_BY_SLUG.get(permissionSlug) ?? []),
      permission.id,
    ]);

    for (const child of permission.children) {
      const childSlug = child.slug.trim().toLowerCase();
      PERMISSION_IDS_BY_SLUG.set(childSlug, [
        ...(PERMISSION_IDS_BY_SLUG.get(childSlug) ?? []),
        child.id,
      ]);
    }
  }
}

export function getPermissionIdsBySlug(slug: string) {
  return PERMISSION_IDS_BY_SLUG.get(slug.trim().toLowerCase()) ?? [];
}

export type RolePermissionSection =
  (typeof ROLE_PERMISSIONS_PAYLOAD.sections)[number];
