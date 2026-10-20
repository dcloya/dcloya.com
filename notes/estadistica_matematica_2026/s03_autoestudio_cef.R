# La esperanza condicional en R
# Estadística Matemática (EO4042), sesión de estudio del 20 de octubre de 2026


# ======================================================================
# 2. Repaso: probabilidad condicional
# ======================================================================

# matrix() acomoda un vector de números en una tabla.
# byrow = TRUE llena renglón por renglón, en el orden en que lo leemos.
# dimnames pone nombres a renglones (valores de X) y columnas (valores de Y).
P <- matrix(c(0.12, 0.10, 0.03,
              0.10, 0.18, 0.07,
              0.05, 0.17, 0.18),
            nrow = 3, byrow = TRUE,
            dimnames = list(x = c(6, 9, 12), y = c(40, 70, 120)))
P

sum(P)                             # una distribución conjunta suma 1

px <- rowSums(P)                   # marginal de X
py <- colSums(P)                   # marginal de Y
px
py

# Y dado X: cada renglón entre su total. R divide la tabla entre px
# renglón por renglón (recicla px a lo largo de las columnas).
PY_dado_X <- P / px
round(PY_dado_X, 3)                # cada renglón suma 1

# Independencia: ¿la conjunta es el producto de las marginales?
# outer(a, b) arma la tabla de todos los productos a_i * b_j.
producto <- outer(px, py)
round(P - producto, 4)             # no son cero: no hay independencia

# Cada barra es la distribución de salarios dentro de un grupo;
# la última es la de toda la población. Con independencia, serían iguales.
colores <- c("grey85", "steelblue", "firebrick")
barras <- cbind(t(PY_dado_X), total = py)
barplot(barras, col = colores,
        xlab = "escolaridad x (la última barra: toda la población)",
        ylab = "P(Y = y | X = x)", ylim = c(0, 1.2),
        main = "Distribución de salarios dentro de cada grupo",
        legend.text = c("Y = 40", "Y = 70", "Y = 120"),
        args.legend = list(x = "top", bty = "n", horiz = TRUE))

P <- matrix(c(0.12, 0.10, 0.03,
              0.10, 0.18, 0.07,
              0.05, 0.17, 0.18),
            nrow = 3, byrow = TRUE,
            dimnames = list(x = c(6, 9, 12), y = c(40, 70, 120)))
px <- rowSums(P)
py <- colSums(P)
PY_dado_X <- P / px

# Directo: celda entre total de la columna.
P["12", "120"] / py["120"]

# Con la fórmula de Bayes.
numerador <- PY_dado_X["12", "120"] * px["12"]
denominador <- sum(PY_dado_X[, "120"] * px)
numerador / denominador            # el mismo número

# ======================================================================
# 3. Predecir sin información
# ======================================================================

y <- c(40, 70, 120)                # valores de Y
py <- c(0.27, 0.45, 0.28)          # P(Y = y)

EY <- sum(y * py)                  # E[Y]
VarY <- sum((y - EY)^2 * py)       # Var(Y)
EY
VarY

# Error cuadrático medio de predecir c para todos.
ecm <- function(c) sum((y - c)^2 * py)

predicciones <- c(60, 75.9, 90)    # <- cambia o agrega predicciones
sapply(predicciones, ecm)
VarY + (EY - predicciones)^2       # la fórmula da lo mismo

# optimize() busca el mínimo de una función de una variable en un intervalo.
optimize(ecm, interval = c(0, 200))$minimum

# La parábola: el piso es Var(Y); el segmento rojo es (E[Y] - c)^2.
cs <- seq(30, 120, by = 0.5)
plot(cs, sapply(cs, ecm), type = "l", lwd = 2,
     xlab = "constante c", ylab = "E[(Y - c)^2]",
     main = "Error = Var(Y) + (E[Y] - c)^2")
abline(h = VarY, lty = 3)
abline(v = EY, lty = 2)
points(predicciones, sapply(predicciones, ecm), pch = 19, col = "firebrick", cex = 1.3)
segments(predicciones, VarY, predicciones, sapply(predicciones, ecm),
         col = "firebrick", lwd = 2)
text(EY, VarY, "Var(Y)", pos = 1, cex = 0.9)

# ======================================================================
# 4. Predecir con información: la CEF
# ======================================================================

P <- matrix(c(0.12, 0.10, 0.03,
              0.10, 0.18, 0.07,
              0.05, 0.17, 0.18),
            nrow = 3, byrow = TRUE,
            dimnames = list(x = c(6, 9, 12), y = c(40, 70, 120)))
x <- c(6, 9, 12)
y <- c(40, 70, 120)
px <- rowSums(P)
py <- colSums(P)

# m(x) = sum_y y P(x, y) / P(x). El producto %*% hace las sumas por renglón.
m <- drop(P %*% y) / px
m

# m(X) como variable aleatoria: valores y probabilidades.
rbind(valor = round(m, 2), probabilidad = px)

# La otra dirección, E[X | Y = y], es otra función.
mX <- drop(x %*% P) / py
mX

# Cada círculo es un salario posible dentro de un grupo, con tamaño
# proporcional a P(Y = y | X = x). El punto rojo es m(x).
PY_dado_X <- P / px
plot(NULL, xlim = c(5, 13), ylim = c(30, 130), xlab = "escolaridad x",
     ylab = "salario y", main = "E[Y | X = x]: un promedio por grupo")
for (i in 1:3) {
  points(rep(x[i], 3), y, cex = 8 * PY_dado_X[i, ], col = "grey40")
}
points(x, m, pch = 19, col = "firebrick", cex = 1.6)
text(x, m, round(m, 1), pos = 4, col = "firebrick")

# ======================================================================
# 5. La ley de esperanzas iteradas
# ======================================================================

P <- matrix(c(0.12, 0.10, 0.03,
              0.10, 0.18, 0.07,
              0.05, 0.17, 0.18),
            nrow = 3, byrow = TRUE,
            dimnames = list(x = c(6, 9, 12), y = c(40, 70, 120)))
y <- c(40, 70, 120)
px <- rowSums(P)
py <- colSums(P)
m <- drop(P %*% y) / px

m * px                             # lo que aporta cada grupo
sum(m * px)                        # promedio de promedios
sum(y * py)                        # promedio general: el mismo

# Barras con ALTURA m(x) y ANCHO P(X = x). El área total es E[Y]:
# la línea punteada es la altura promedio, pesando por el ancho.
barplot(m, width = px, space = 0, col = c("grey80", "steelblue", "firebrick"),
        names.arg = paste0("x = ", names(m), "\n(peso ", px, ")"),
        ylab = "m(x)", ylim = c(0, 100),
        main = "E[Y] = promedio de m(x) ponderado por P(X = x)")
abline(h = sum(m * px), lty = 2, lwd = 2)
text(0.05, sum(m * px), "E[Y] = 75.9", pos = 3, adj = 0)

pH <- c(0.4, 0.6)                  # <- escolaridad de los hombres (secundaria, universidad)
mH <- c(60, 120)                   # salario promedio por nivel, hombres
pM <- c(0.8, 0.2)                  # <- escolaridad de las mujeres
mM <- c(62, 124)                   # salario promedio por nivel, mujeres

mM - mH                            # dentro de cada nivel, las mujeres ganan más

EH <- sum(pH * mH)                 # ley de esperanzas iteradas, hombres
EM <- sum(pM * mM)                 # ley de esperanzas iteradas, mujeres
EM - EH                            # en el agregado, las mujeres ganan menos

# Descomposición: sumar y restar sum(mH * pM).
dentro <- sum((mM - mH) * pM)      # diferencias dentro de cada nivel
composicion <- sum(mH * (pM - pH)) # diferencias en la escolaridad
c(dentro = dentro, composicion = composicion, suma = dentro + composicion)

# Promedios por nivel (izquierda) y promedio general (derecha).
plot(c(1, 2), mH, type = "b", pch = 19, col = "steelblue", lwd = 2,
     xlim = c(0.6, 3.6), ylim = c(40, 135), xaxt = "n",
     xlab = "", ylab = "salario promedio", main = "Paradoja de Simpson")
lines(c(1, 2), mM, type = "b", pch = 15, col = "firebrick", lwd = 2)
points(3.2, EH, pch = 19, col = "steelblue", cex = 2)
points(3.2, EM, pch = 15, col = "firebrick", cex = 2)
axis(1, at = c(1, 2, 3.2), labels = c("secundaria", "universidad", "general"))
abline(v = 2.6, col = "grey60")
legend("topleft", bty = "n", pch = c(19, 15), col = c("steelblue", "firebrick"),
       legend = c("hombres", "mujeres"))

# ======================================================================
# 6. Propiedades de la esperanza condicional
# ======================================================================

P <- matrix(c(0.12, 0.10, 0.03,
              0.10, 0.18, 0.07,
              0.05, 0.17, 0.18),
            nrow = 3, byrow = TRUE,
            dimnames = list(x = c(6, 9, 12), y = c(40, 70, 120)))
x <- c(6, 9, 12)
y <- c(40, 70, 120)
px <- rowSums(P)
m <- drop(P %*% y) / px

EY2_dado_X <- drop(P %*% y^2) / px # E[Y^2 | X = x]
s2 <- EY2_dado_X - m^2             # varianza condicional
s2
sqrt(s2)                           # desviación estándar dentro de cada grupo

# Propiedad 5: E[g(X) Y] celda por celda contra E[g(X) m(X)] con promedios de grupo.
g <- function(x) x                 # <- prueba x^2, log(x), x >= 12
EgY <- sum(outer(g(x), y) * P)
Egm <- sum(g(x) * m * px)
c(celda_por_celda = EgY, promedios_de_grupo = Egm)

# m(x) con una banda de más/menos una desviación estándar.
plot(x, m, pch = 19, col = "firebrick", cex = 1.5, xlim = c(5, 13), ylim = c(20, 130),
     xlab = "escolaridad x", ylab = "salario", main = "m(x) y su dispersión sigma(x)")
arrows(x, m - sqrt(s2), x, m + sqrt(s2), angle = 90, code = 3, length = 0.08, lwd = 2)
text(x, m + sqrt(s2), paste("sigma =", round(sqrt(s2), 1)), pos = 3, cex = 0.9)

# ======================================================================
# 7. Varianza total
# ======================================================================

P <- matrix(c(0.12, 0.10, 0.03,
              0.10, 0.18, 0.07,
              0.05, 0.17, 0.18),
            nrow = 3, byrow = TRUE,
            dimnames = list(x = c(6, 9, 12), y = c(40, 70, 120)))
y <- c(40, 70, 120)
px <- rowSums(P)
py <- colSums(P)
m <- drop(P %*% y) / px
s2 <- drop(P %*% y^2) / px - m^2
EY <- sum(y * py)

dentro <- sum(s2 * px)             # E[Var(Y | X)]
entre <- sum((m - EY)^2 * px)      # Var(m(X))
VarY <- sum(y^2 * py) - EY^2       # Var(Y)

c(dentro = dentro, entre = entre, suma = dentro + entre, VarY = VarY)
entre / VarY                       # eta^2

# La varianza total partida en sus dos pedazos.
partes <- matrix(c(dentro, entre), ncol = 1)
barplot(partes, col = c("steelblue", "darkorange"), horiz = TRUE,
        xlab = "varianza", main = "Var(Y) = dentro + entre")
text(dentro / 2, 0.7, paste("dentro: E[Var(Y | X)] =", round(dentro, 1)), col = "white")
text(dentro + entre / 2, 0.7, paste("entre\n", round(entre, 1)))

# ======================================================================
# 8. La CEF es el mejor predictor
# ======================================================================

P <- matrix(c(0.12, 0.10, 0.03,
              0.10, 0.18, 0.07,
              0.05, 0.17, 0.18),
            nrow = 3, byrow = TRUE,
            dimnames = list(x = c(6, 9, 12), y = c(40, 70, 120)))
y <- c(40, 70, 120)
px <- rowSums(P)
py <- colSums(P)
m <- drop(P %*% y) / px
s2 <- drop(P %*% y^2) / px - m^2
EY <- sum(y * py)

# Error de una regla g, calculado celda por celda.
# outer(g, y, ...) arma la tabla de errores al cuadrado (y - g(x))^2.
error_regla <- function(g) sum(P * outer(g, y, function(a, b) (b - a)^2))

# Varias reglas: una predicción para x = 6, 9, 12.
reglas <- list(
  "constante 60" = c(60, 60, 60),
  "media" = rep(EY, 3),
  "regla de dedo" = c(60, 60, 90),     # <- cambia la regla
  "CEF" = m,
  "CEF exagerada" = EY + 2 * (m - EY)
)
errores <- sapply(reglas, error_regla)
round(errores, 1)

# El teorema: error de la CEF + promedio de (m - g)^2.
g <- reglas[["regla de dedo"]]
c(directo = error_regla(g), teorema = sum(s2 * px) + sum((m - g)^2 * px))

barplot(errores, col = ifelse(names(errores) == "CEF", "firebrick", "grey70"),
        ylab = "error cuadrático medio", main = "Ninguna regla le gana a la CEF",
        ylim = c(0, 1250), cex.names = 0.8)
abline(h = errores["CEF"], lty = 2)

dentro <- 784.0                    # E[Var(Y | X)]
entre <- 124.2                     # Var(m(X))

ecm_lambda <- function(lam) dentro + (1 - lam)^2 * entre

lambda <- 1.5                      # <- cambia lambda
ecm_lambda(c(0, 1, 2))

curve(ecm_lambda(x), from = -0.5, to = 2.5, lwd = 2,
      xlab = "lambda", ylab = "error cuadrático medio",
      main = "De la media (0) a la CEF (1) y más allá")
abline(v = 1, lty = 2)
points(lambda, ecm_lambda(lambda), pch = 19, col = "firebrick", cex = 1.5)

# ======================================================================
# 9. El error de la CEF
# ======================================================================

P <- matrix(c(0.12, 0.10, 0.03,
              0.10, 0.18, 0.07,
              0.05, 0.17, 0.18),
            nrow = 3, byrow = TRUE,
            dimnames = list(x = c(6, 9, 12), y = c(40, 70, 120)))
x <- c(6, 9, 12)
y <- c(40, 70, 120)
px <- rowSums(P)
m <- drop(P %*% y) / px

# Tabla de errores: en la celda (x, y), e = y - m(x).
E <- outer(-m, y, "+")
round(E, 2)

sum(E * P)                         # E[e] = 0

# E[h(X) e] para varias funciones h: todas dan cero.
h <- list(x = x, x2 = x^2, log = log(x), mayor12 = as.numeric(x >= 12))
round(sapply(h, function(hx) sum(hx * E * P)), 10)

# Los errores posibles en cada grupo, con tamaño proporcional a su
# probabilidad condicional. El promedio (rojo) es cero en los tres grupos;
# la barra azul (más/menos sigma) crece con x.
PY_dado_X <- P / px
sd_e <- sqrt(drop(P %*% y^2) / px - m^2)
plot(NULL, xlim = c(5, 13), ylim = c(-60, 70), xlab = "escolaridad x",
     ylab = "error e = y - m(x)", main = "Promedio cero, dispersión creciente")
abline(h = 0, lty = 2)
for (i in 1:3) {
  points(rep(x[i], 3), E[i, ], cex = 8 * PY_dado_X[i, ], col = "grey40")
}
points(x, rep(0, 3), pch = 19, col = "firebrick", cex = 1.5)
arrows(x + 0.6, -sd_e, x + 0.6, sd_e, angle = 90, code = 3, length = 0.05,
       col = "steelblue", lwd = 2)

set.seed(1)
n <- 10000
X <- rbinom(n, 1, 0.5)                             # X vale 0 o 1
signo <- sample(c(-1, 1), n, replace = TRUE)       # mitad y mitad
Y <- ifelse(X == 0, 1, 3) * signo                  # Y = +-1 si X = 0; +-3 si X = 1

tapply(Y, X, mean)                 # m(0) y m(1): casi cero
tapply(abs(Y), X, mean)            # pero el tamaño del error es 1 o 3

# ======================================================================
# 10. La CEF de una variable binaria
# ======================================================================

r <- 60                            # <- salario de reserva
sigma <- 30                        # <- dispersión del salario potencial
m <- function(x) 30 + 2 * x + 0.25 * x^2
x <- c(6, 9, 12, 16)

# pnorm() es Phi, la acumulada de la normal estándar.
p <- pnorm((m(x) - r) / sigma)
round(rbind(m = m(x), z = (m(x) - r) / sigma, p = p), 3)

# Comprobación por simulación: la fracción que trabaja en cada grupo.
set.seed(2026)
n <- 100000
X <- sample(x, n, replace = TRUE)
e <- rnorm(n, mean = 0, sd = sigma)
D <- as.numeric(m(X) + e > r)      # 1 si trabaja
tapply(D, X, mean)                 # cerca de p

curve(pnorm((m(x) - r) / sigma), from = 0, to = 20, lwd = 2, col = "steelblue",
      ylim = c(0, 1), xlab = "escolaridad x", ylab = "P(D = 1 | X = x)",
      main = "La CEF de una binaria")
points(x, tapply(D, X, mean), pch = 19, col = "firebrick")

# ======================================================================
# 11.1 Con X discreta: un promedio por grupo
# ======================================================================

n <- 20000                         # <- tamaño de muestra (prueba 200)

set.seed(2026)
# Escolaridad: 6, 9, 12 o 16 años.
X <- sample(c(6, 9, 12, 16), n, replace = TRUE, prob = c(0.25, 0.30, 0.30, 0.15))
# Habilidad: mayor, en promedio, con más escolaridad.
A <- rnorm(n, mean = -1 + 0.08 * X)
# Salario: depende de X, de A y de un ruido cuya dispersión (2X) crece con X.
f <- function(x) 30 + 2 * x + 0.25 * x^2
u <- rnorm(n, mean = 0, sd = 2 * X)
Y <- f(X) + 15 * A + u

xs <- c(6, 9, 12, 16)
m_true <- f(xs) + 15 * (-1 + 0.08 * xs)            # la CEF verdadera

# tapply(Y, X, función) aplica la función a Y dentro de cada grupo de X.
m_hat <- tapply(Y, X, mean)
n_x <- table(X)
se_x <- tapply(Y, X, sd) / sqrt(n_x)
inf <- m_hat - 1.96 * se_x                          # intervalo de 95%
sup <- m_hat + 1.96 * se_x

round(cbind(n_x, m_hat, se_x, inf, sup, m_true), 2)

# Nube de puntos, promedio por grupo con su intervalo, y la verdad.
plot(jitter(X, amount = 0.4), Y, pch = 16, cex = 0.3, col = adjustcolor("grey40", 0.3),
     xlab = "escolaridad", ylab = "salario por hora",
     main = paste("Un promedio por grupo, n =", n))
arrows(xs, inf, xs, sup, angle = 90, code = 3, length = 0.05, col = "firebrick", lwd = 2)
points(xs, m_hat, pch = 19, col = "firebrick", cex = 1.3)
points(xs + 0.6, m_true, pch = 4, col = "black", cex = 1.3, lwd = 2)
legend("topleft", bty = "n", pch = c(19, 4), col = c("firebrick", "black"),
       legend = c("promedio del grupo", "m(x) verdadera"))

# La descomposición de la varianza también vale en la muestra (con denominador n).
m_i <- ave(Y, X)                   # a cada persona, el promedio de su grupo
c(total = mean((Y - mean(Y))^2),
  dentro = mean((Y - m_i)^2),
  entre = mean((m_i - mean(Y))^2))

# ======================================================================
# 11.2 Con X continua: sesgo contra varianza
# ======================================================================

K <- 8                             # <- número de intervalos (prueba 2 y 40)
n <- 2000                          # <- tamaño de muestra
sigma <- 60                        # <- ruido

set.seed(2026)
m <- function(x) 50 + 4 * x - 0.06 * x^2           # salario según experiencia
malla <- seq(0.5, 39.5, by = 1)                    # puntos donde medimos el error
cortes <- seq(0, 40, length.out = K + 1)

# Una estimación: cut() asigna cada x a su intervalo; tapply() promedia y en cada uno.
una_estimacion <- function() {
  x <- runif(n, 0, 40)
  y <- m(x) + rnorm(n, sd = sigma)
  m_hat <- tapply(y, cut(x, cortes, include.lowest = TRUE), mean)
  m_hat[cut(malla, cortes, include.lowest = TRUE)]
}

# 30 muestras distintas: cada línea azul es una estimación.
plot(NULL, xlim = c(0, 40), ylim = c(20, 160), xlab = "experiencia",
     ylab = "salario por hora", main = paste("30 estimaciones con K =", K))
errores <- numeric(30)
for (r in 1:30) {
  est <- una_estimacion()
  lines(malla, est, type = "s", col = adjustcolor("steelblue", 0.35))
  errores[r] <- mean((est - m(malla))^2)
}
curve(m(x), add = TRUE, lwd = 3)
mean(errores)                      # error cuadrático medio promedio con este K

set.seed(2026)
m <- function(x) 50 + 4 * x - 0.06 * x^2
malla <- seq(0.5, 39.5, by = 1)
n <- 2000
sigma <- 60

# Error cuadrático medio con K intervalos, promediado sobre R muestras.
ecm_K <- function(K, R = 100) {
  cortes <- seq(0, 40, length.out = K + 1)
  j <- cut(malla, cortes, include.lowest = TRUE)
  errores <- replicate(R, {
    x <- runif(n, 0, 40)
    y <- m(x) + rnorm(n, sd = sigma)
    m_hat <- tapply(y, cut(x, cortes, include.lowest = TRUE), mean)
    mean((m_hat[j] - m(malla))^2)
  })
  mean(errores)
}

K <- c(2, 4, 6, 8, 11, 15, 20, 30, 40)
ecm <- sapply(K, ecm_K)
round(cbind(K, ecm), 1)

plot(K, ecm, type = "b", pch = 19, cex = 1.3, ylim = c(0, 150),
     xlab = "número de intervalos K", ylab = "error cuadrático medio",
     main = "Sesgo contra varianza")
abline(v = K[which.min(ecm)], lty = 2, col = "firebrick")

# ======================================================================
# 11.3 Muchas variables: la maldición de la dimensionalidad
# ======================================================================

n <- 10000                         # <- hogares en la encuesta
set.seed(2026)

ks <- 1:6                          # número de variables
ocupadas <- numeric(length(ks))
con_una <- numeric(length(ks))

for (k in ks) {
  # Cada hogar recibe k valores al azar entre 0 y 9; paste() los pega en
  # una etiqueta de celda, por ejemplo "3 0 7".
  columnas <- replicate(k, sample(0:9, n, replace = TRUE), simplify = FALSE)
  celdas <- do.call(paste, columnas)
  tab <- table(celdas)
  ocupadas[k] <- length(tab)
  con_una[k] <- mean(tab == 1)
}

data.frame(k = ks,
           posibles = format(10^ks, big.mark = ",", scientific = FALSE),
           ocupadas = ocupadas,
           fraccion_con_un_hogar = round(con_una, 3))

par(mfrow = c(1, 2))
plot(ks, 10^ks, log = "y", type = "b", pch = 19, xlab = "número de variables k",
     ylab = "celdas (escala log)", main = "Celdas posibles y ocupadas")
lines(ks, ocupadas, type = "b", pch = 19, col = "firebrick")
abline(h = n, lty = 2)
legend("topleft", bty = "n", pch = 19, col = c("black", "firebrick"),
       legend = c("posibles", "ocupadas"))
plot(ks, con_una, type = "b", pch = 19, col = "steelblue", ylim = c(0, 1),
     xlab = "número de variables k", ylab = "fracción",
     main = "Celdas con un solo hogar")
par(mfrow = c(1, 1))

# ======================================================================
# Hacia la tarea: la CEF en la ENOE
# ======================================================================

# Requiere el archivo de la ENOE: quita el '# ' inicial de cada línea para correrlo.
# # Lee la tabla sociodemográfica. El nombre del archivo cambia con el trimestre.
# enoe <- read.csv("ENOE_SDEMT.csv")            # <- pon aquí el nombre de tu archivo

# # Los nombres de las columnas vienen en mayúsculas o minúsculas según el año.
# names(enoe) <- tolower(names(enoe))

# # Entrevista completa (r_def = 00), residentes (c_res = 1 o 3), 15 años o más.
# enoe <- subset(enoe, r_def == 0 & c_res %in% c(1, 3) & eda >= 15 & eda <= 97)

# # Ocupados (clase2 = 1) con ingreso por hora positivo y escolaridad conocida.
# ocupados <- subset(enoe, clase2 == 1 & ing_x_hrs > 0 & anios_esc != 99)
# nrow(ocupados)

# # Tu submuestra: los dígitos de tu matrícula como semilla (A01234567 -> 1234567).
# set.seed(1234567)                             # <- tu matrícula
# mi_muestra <- ocupados[sample(nrow(ocupados), 5000), ]

# # Primer vistazo: ingreso por hora promedio por años de escolaridad.
# tapply(mi_muestra$ing_x_hrs, mi_muestra$anios_esc, mean)
