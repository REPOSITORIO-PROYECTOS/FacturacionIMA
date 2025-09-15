
-- Crear usuario: Prueba1
-- Fecha de creación: 2025-09-15 20:59:13

-- 1. Insertar rol si no existe
INSERT IGNORE INTO roles (nombre) VALUES ('Admin');

-- 2. Obtener ID del rol
SET @rol_id = (SELECT id FROM roles WHERE nombre = 'Admin' LIMIT 1);

-- 3. Insertar empresa si no existe (empresa por defecto)
INSERT IGNORE INTO empresas (nombre, cuit, direccion, activa, creado_en) 
VALUES ('Empresa IMA', '20-12345678-9', 'Dirección por defecto', 1, NOW());

-- 4. Obtener ID de empresa
SET @empresa_id = (SELECT id FROM empresas WHERE nombre = 'Empresa IMA' LIMIT 1);

-- 5. Insertar usuario
INSERT INTO usuarios (nombre_usuario, password_hash, activo, creado_en, id_rol, id_empresa)
VALUES ('Prueba1', '$2b$12$BHmllEo7DDfpnBXZ9k606eRyk4wGSkhCby1tA.W3Yul71UEBcDbRa', 1, '2025-09-15 20:59:13', @rol_id, @empresa_id);

-- Verificar que se creó correctamente
SELECT u.id, u.nombre_usuario, u.activo, r.nombre as rol, e.nombre as empresa
FROM usuarios u 
JOIN roles r ON u.id_rol = r.id 
JOIN empresas e ON u.id_empresa = e.id 
WHERE u.nombre_usuario = 'Prueba1';
