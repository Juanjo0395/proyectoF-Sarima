# 1. Imagen base oficial de Python 3.12, versión liviana
FROM python:3.12-slim

# 2. Carpeta de trabajo dentro del contenedor
WORKDIR /app

# 3. Primero solo requirements.txt: si el código cambia pero las dependencias no,
#    Docker reutiliza esta capa (CACHED) y el build tarda segundos.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 4. Solo las carpetas que necesita la app (nunca el .env ni credenciales)
COPY app/ ./app/
COPY frontend/ ./frontend/
COPY models/ ./models/

# 5. Puerto en el que escucha uvicorn
EXPOSE 8000

# 6. 0.0.0.0 = escuchar en todas las interfaces, para que -p 8000:8000 llegue a la app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
