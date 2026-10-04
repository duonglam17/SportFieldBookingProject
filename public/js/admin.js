const adminState = {
  sportTypes: [],
  fields: [],
  priceRules: [],
};

function showAdminMessage(message, isError = false) {
  const element = document.getElementById('admin-message');
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('form-message-error', isError);
  element.classList.toggle('form-message-success', !isError && Boolean(message));
}

function populateSelect(select, options, valueField = 'id', labelField = 'name') {
  const previousValue = select.value;
  select.replaceChildren();

  options.forEach((option) => {
    const item = document.createElement('option');
    item.value = option[valueField];
    item.textContent = option[labelField];
    select.appendChild(item);
  });

  if (previousValue) {
    select.value = previousValue;
  }
  select.disabled = options.length === 0;
  if (options.length === 0) {
    const item = document.createElement('option');
    item.value = '';
    item.textContent = 'Chưa có dữ liệu';
    select.appendChild(item);
  }
}

function appendTextCell(row, value) {
  const cell = document.createElement('td');
  cell.textContent = String(value ?? '—');
  row.appendChild(cell);
  return cell;
}

function createActionButton(label, action, id) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button-secondary admin-row-action';
  button.dataset.action = action;
  button.dataset.id = String(id);
  button.textContent = label;
  return button;
}

function appendEmptyRow(tbody, message, columns) {
  const row = document.createElement('tr');
  const cell = appendTextCell(row, message);
  cell.colSpan = columns;
  tbody.appendChild(row);
}

function showLoadFailure() {
  appendEmptyRow(document.getElementById('field-table-body'), 'Không tải được danh sách sân.', 5);
  appendEmptyRow(
    document.getElementById('price-rule-table-body'),
    'Không tải được bảng giá.',
    6,
  );
}

async function loadAdminData() {
  showAdminMessage('Đang tải dữ liệu quản lý...');
  document.getElementById('field-table-body').replaceChildren();
  appendEmptyRow(document.getElementById('field-table-body'), 'Đang tải danh sách sân...', 5);
  document.getElementById('price-rule-table-body').replaceChildren();
  appendEmptyRow(
    document.getElementById('price-rule-table-body'),
    'Đang tải bảng giá...',
    6,
  );
  const [sportTypeResponse, fieldResponse, priceRuleResponse] = await Promise.all([
    apiFetch('/api/admin/sport-types'),
    apiFetch('/api/admin/fields'),
    apiFetch('/api/admin/price-rules'),
  ]);

  adminState.sportTypes = sportTypeResponse.data;
  adminState.fields = fieldResponse.data;
  adminState.priceRules = priceRuleResponse.data;

  populateSelect(document.getElementById('field-sport-type'), adminState.sportTypes);
  populateSelect(document.getElementById('price-sport-type'), adminState.sportTypes);
  renderFieldRows();
  renderPriceRows();
}

function renderFieldRows() {
  const tbody = document.getElementById('field-table-body');
  if (!tbody) return;

  tbody.replaceChildren();
  if (adminState.fields.length === 0) {
    appendEmptyRow(tbody, 'Chưa có sân nào được tạo.', 5);
    return;
  }
  adminState.fields.forEach((field) => {
    const row = document.createElement('tr');
    const sportTypeName = adminState.sportTypes.find((type) => type.id === field.sport_type_id)?.name || '—';
    appendTextCell(row, field.id);
    appendTextCell(row, field.name);
    appendTextCell(row, sportTypeName);
    appendTextCell(row, field.status);
    const actions = document.createElement('td');
    actions.className = 'admin-row-actions';
    actions.append(
      createActionButton('Sửa', 'edit-field', field.id),
      createActionButton(
        field.status === 'active' ? 'Đặt maintenance' : 'Kích hoạt',
        'toggle-field',
        field.id,
      ),
      createActionButton('Xóa', 'delete-field', field.id),
    );
    row.appendChild(actions);
    tbody.appendChild(row);
  });
}

function renderPriceRows() {
  const tbody = document.getElementById('price-rule-table-body');
  if (!tbody) return;

  tbody.replaceChildren();
  if (adminState.priceRules.length === 0) {
    appendEmptyRow(tbody, 'Chưa có quy tắc giá nào được tạo.', 6);
    return;
  }
  adminState.priceRules.forEach((rule) => {
    const row = document.createElement('tr');
    const sportTypeName = adminState.sportTypes.find((type) => type.id === rule.sport_type_id)?.name || '—';
    appendTextCell(row, rule.id);
    appendTextCell(row, sportTypeName);
    appendTextCell(row, rule.day_type);
    appendTextCell(row, `${rule.start_time} - ${rule.end_time}`);
    appendTextCell(row, `${Number(rule.price_per_hour).toLocaleString('vi-VN')}đ`);
    const actions = document.createElement('td');
    actions.className = 'admin-row-actions';
    actions.append(
      createActionButton('Sửa', 'edit-price', rule.id),
      createActionButton('Xóa', 'delete-price', rule.id),
    );
    row.appendChild(actions);
    tbody.appendChild(row);
  });
}

async function handleFieldSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector('[type="submit"]');
  submitButton.disabled = true;
  const formData = new FormData(form);
  const id = formData.get('fieldId');
  const payload = {
    name: formData.get('name'),
    sportTypeId: Number(formData.get('sportTypeId')),
    status: formData.get('status'),
    description: formData.get('description'),
  };

  try {
    if (id) {
      await apiFetch(`/api/admin/fields/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    } else {
      await apiFetch('/api/admin/fields', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }

    form.reset();
    document.getElementById('field-id').value = '';
    await loadAdminData();
    showAdminMessage(id ? 'Cập nhật sân thành công.' : 'Thêm sân thành công.', false);
  } catch (error) {
    showAdminMessage(error.message, true);
  } finally {
    submitButton.disabled = false;
  }
}

async function handlePriceRuleSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector('[type="submit"]');
  submitButton.disabled = true;
  const formData = new FormData(form);
  const id = formData.get('priceRuleId');
  const payload = {
    sportTypeId: Number(formData.get('sportTypeId')),
    dayType: formData.get('dayType'),
    startTime: formData.get('startTime'),
    endTime: formData.get('endTime'),
    pricePerHour: Number(formData.get('pricePerHour')),
  };

  try {
    if (id) {
      await apiFetch(`/api/admin/price-rules/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    } else {
      await apiFetch('/api/admin/price-rules', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }

    form.reset();
    document.getElementById('price-rule-id').value = '';
    await loadAdminData();
    showAdminMessage(id ? 'Cập nhật quy tắc giá thành công.' : 'Thêm quy tắc giá thành công.', false);
  } catch (error) {
    showAdminMessage(error.message, true);
  } finally {
    submitButton.disabled = false;
  }
}

async function handleTableAction(event) {
  const button = event.target.closest('button');
  if (!button) return;

  const { action, id } = button.dataset;
  if (!action || !id) return;
  if (action !== 'edit-field' && action !== 'edit-price') button.disabled = true;

  try {
    if (action === 'edit-field') {
      const field = adminState.fields.find((item) => item.id === Number(id));
      if (!field) return;
      document.getElementById('field-id').value = field.id;
      document.getElementById('field-name').value = field.name;
      document.getElementById('field-sport-type').value = field.sport_type_id;
      document.getElementById('field-status').value = field.status;
      document.getElementById('field-description').value = field.description || '';
      showAdminMessage('Đang sửa sân.', false);
      return;
    }

    if (action === 'toggle-field') {
      const field = adminState.fields.find((item) => item.id === Number(id));
      if (!field) return;
      const nextStatus = field.status === 'active' ? 'maintenance' : 'active';
      await apiFetch(`/api/admin/fields/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadAdminData();
      showAdminMessage(`Đã đổi trạng thái sân thành ${nextStatus}.`, false);
      return;
    }

    if (action === 'delete-field') {
      if (!window.confirm('Bạn có chắc muốn xóa sân này?')) return;
      await apiFetch(`/api/admin/fields/${id}`, { method: 'DELETE' });
      await loadAdminData();
      showAdminMessage('Xóa sân thành công.', false);
      return;
    }

    if (action === 'edit-price') {
      const rule = adminState.priceRules.find((item) => item.id === Number(id));
      if (!rule) return;
      document.getElementById('price-rule-id').value = rule.id;
      document.getElementById('price-sport-type').value = rule.sport_type_id;
      document.getElementById('price-day-type').value = rule.day_type;
      document.getElementById('price-start-time').value = rule.start_time.slice(0, 5);
      document.getElementById('price-end-time').value = rule.end_time.slice(0, 5);
      document.getElementById('price-per-hour').value = rule.price_per_hour;
      showAdminMessage('Đang sửa quy tắc giá.', false);
      return;
    }

    if (action === 'delete-price') {
      if (!window.confirm('Bạn có chắc muốn xóa quy tắc giá này?')) return;
      await apiFetch(`/api/admin/price-rules/${id}`, { method: 'DELETE' });
      await loadAdminData();
      showAdminMessage('Xóa quy tắc giá thành công.', false);
    }
  } catch (error) {
    showAdminMessage(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function initAdminPage() {
  try {
    const sessionResponse = await apiFetch('/api/auth/me');
    if (!sessionResponse.data || !sessionResponse.data.user || !['admin'].includes(sessionResponse.data.user.role)) {
      window.redirectToAdminLogin();
      return;
    }

    await loadAdminData();
    showAdminMessage('');
    document.getElementById('field-form').addEventListener('submit', handleFieldSubmit);
    document.getElementById('price-rule-form').addEventListener('submit', handlePriceRuleSubmit);
    document.getElementById('field-reset').addEventListener('click', () => {
      document.getElementById('field-form').reset();
      document.getElementById('field-id').value = '';
    });
    document.getElementById('price-rule-reset').addEventListener('click', () => {
      document.getElementById('price-rule-form').reset();
      document.getElementById('price-rule-id').value = '';
    });
    document.addEventListener('click', handleTableAction);
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      window.redirectToAdminLogin();
      return;
    }
    showLoadFailure();
    showAdminMessage(error.message, true);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initAdminPage();
});
