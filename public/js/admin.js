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
  select.innerHTML = '';

  options.forEach((option) => {
    const item = document.createElement('option');
    item.value = option[valueField];
    item.textContent = option[labelField];
    select.appendChild(item);
  });

  if (previousValue) {
    select.value = previousValue;
  }
}

async function loadAdminData() {
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

  tbody.innerHTML = '';
  adminState.fields.forEach((field) => {
    const row = document.createElement('tr');
    const sportTypeName = adminState.sportTypes.find((type) => type.id === field.sport_type_id)?.name || '—';

    row.innerHTML = `
      <td>${field.id}</td>
      <td>${field.name}</td>
      <td>${sportTypeName}</td>
      <td>${field.status}</td>
      <td>
        <button type="button" data-action="edit-field" data-id="${field.id}">Sửa</button>
        <button type="button" data-action="toggle-field" data-id="${field.id}">${field.status === 'active' ? 'Đặt maintenance' : 'Kích hoạt'}</button>
        <button type="button" data-action="delete-field" data-id="${field.id}">Xóa</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function renderPriceRows() {
  const tbody = document.getElementById('price-rule-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';
  adminState.priceRules.forEach((rule) => {
    const row = document.createElement('tr');
    const sportTypeName = adminState.sportTypes.find((type) => type.id === rule.sport_type_id)?.name || '—';

    row.innerHTML = `
      <td>${rule.id}</td>
      <td>${sportTypeName}</td>
      <td>${rule.day_type}</td>
      <td>${rule.start_time} - ${rule.end_time}</td>
      <td>${Number(rule.price_per_hour).toLocaleString('vi-VN')}đ</td>
      <td>
        <button type="button" data-action="edit-price" data-id="${rule.id}">Sửa</button>
        <button type="button" data-action="delete-price" data-id="${rule.id}">Xóa</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

async function handleFieldSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
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
      showAdminMessage('Cập nhật sân thành công.', false);
    } else {
      await apiFetch('/api/admin/fields', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      showAdminMessage('Thêm sân thành công.', false);
    }

    event.currentTarget.reset();
    document.getElementById('field-id').value = '';
    await loadAdminData();
  } catch (error) {
    showAdminMessage(error.message, true);
  }
}

async function handlePriceRuleSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
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
      showAdminMessage('Cập nhật quy tắc giá thành công.', false);
    } else {
      await apiFetch('/api/admin/price-rules', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      showAdminMessage('Thêm quy tắc giá thành công.', false);
    }

    event.currentTarget.reset();
    document.getElementById('price-rule-id').value = '';
    await loadAdminData();
  } catch (error) {
    showAdminMessage(error.message, true);
  }
}

async function handleTableAction(event) {
  const button = event.target.closest('button');
  if (!button) return;

  const { action, id } = button.dataset;
  if (!action || !id) return;

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
      showAdminMessage(`Đã đổi trạng thái sân thành ${nextStatus}.`, false);
      await loadAdminData();
      return;
    }

    if (action === 'delete-field') {
      if (!window.confirm('Bạn có chắc muốn xóa sân này?')) return;
      await apiFetch(`/api/admin/fields/${id}`, { method: 'DELETE' });
      showAdminMessage('Xóa sân thành công.', false);
      await loadAdminData();
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
      showAdminMessage('Xóa quy tắc giá thành công.', false);
      await loadAdminData();
    }
  } catch (error) {
    showAdminMessage(error.message, true);
  }
}

async function initAdminPage() {
  try {
    const sessionResponse = await apiFetch('/api/auth/me');
    if (!sessionResponse.data || !sessionResponse.data.user || !['admin'].includes(sessionResponse.data.user.role)) {
      window.location.href = '/login.html';
      return;
    }

    await loadAdminData();
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
    window.location.href = '/login.html';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initAdminPage();
});
