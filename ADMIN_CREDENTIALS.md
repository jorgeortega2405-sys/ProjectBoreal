# Credenciales de Acceso - Panel Administrativo (Puerto 3001)

Este archivo contiene la información de acceso inicial para el panel de administración de **Project Boreal** y las instrucciones para gestionar cuentas adicionales en base de datos.

---

## 1. Cuenta de Administrador Inicial

| Campo | Valor |
| :--- | :--- |
| **URL de Acceso** | `http://localhost:3001` (o `/login`) |
| **Correo Electrónico** | `admin@projectboreal.com` |
| **Contraseña** | `Admin1234!` |
| **Nombre** | Administrador General |
| **UUID** | `e1a2b3c4-d5e6-7f8a-9b0c-1d2e3f4a5b6c` |
| **Estado** | Activo (`is_active = 1`) |

---

## 2. Creación de Nuevas Cuentas de Administrador

Dado que el panel no cuenta con registro público por motivos de seguridad, las cuentas adicionales se dan de alta directamente en MySQL en la base de datos `db_lottery`, tabla `admin_users`.

### Formato de Contraseña (scrypt)
Las contraseñas se almacenan mediante el algoritmo `scrypt` con sal criptográfica aleatoria de 16 bytes, `N=16384`, `r=8`, `p=1` y longitud de clave de 64 bytes.

### Generar un nuevo hash desde Node.js:
Puedes generar el hash scrypt para una nueva contraseña ejecutando en la terminal:
```bash
npx tsx -e "import('./admin/src/utils/crypto.util.ts').then(async m => { console.log(await m.hashPassword('TuContraseñaSegura')); });"
```

### Sentencia SQL para insertar un nuevo administrador y asignarle un rol:
```sql
USE `db_lottery`;

INSERT INTO `admin_users` (`uuid`, `name`, `email`, `password_hash`, `is_active`)
VALUES (
  UUID(),
  'Nombre del Administrador',
  'nuevo_admin@projectboreal.com',
  'HASH_GENERADO_AQUI',
  1
);

-- Asignar un rol (ej. BILLING_AGENT, OPERATIONS_MANAGER, CUSTOMER_SUCCESS, AUDITOR, HR_MANAGER, SUPER_ADMIN, etc.)
INSERT INTO `admin_user_roles` (`admin_user_id`, `role_id`)
SELECT u.`id`, r.`id`
FROM `admin_users` u
INNER JOIN `roles` r ON r.`name` = 'BILLING_AGENT'
WHERE u.`email` = 'nuevo_admin@projectboreal.com';
```

### Catálogo de Roles Activos en Base de Datos (`roles`)
El panel administrativo utiliza **14 roles operativos** con permisos efectivos asignados en `role_permissions`:
- **Platform**: `SUPER_ADMIN`, `SECURITY_ADMIN`, `COMPLIANCE_ADMIN`, `AUDITOR`
- **Finance**: `FINANCE_ADMIN`, `BILLING_MANAGER`, `BILLING_AGENT`
- **Operations & HR**: `OPERATIONS_MANAGER`, `OPERATIONS_AGENT`, `HR_MANAGER`, `HR_RECRUITER`
- **Support & Data**: `SUPPORT_MANAGER`, `CUSTOMER_SUCCESS`, `DATA_ANALYST`

### Desactivar o reactivar un administrador:
```sql
-- Desactivar cuenta
UPDATE `admin_users` SET `is_active` = 0 WHERE `email` = 'nuevo_admin@projectboreal.com';

-- Reactivar cuenta
UPDATE `admin_users` SET `is_active` = 1 WHERE `email` = 'nuevo_admin@projectboreal.com';
```

