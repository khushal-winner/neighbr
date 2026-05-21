package middleware

import (
	"fmt"
	"os"

	"github.com/golang-jwt/jwt/v5"
)

// this means we can use the struct as a jwt.Claims
type Claims struct {
	Sub string `json:"sub"`
	Email string `json:"email"`
	CommunityID *string `json:"communityId"`
	jwt.RegisteredClaims
}


// verifyToken parses and validates a validates a JWT signed by identity service
// returns claim on success, error on invalid/expired token

func VerifyToken(tokenString string) (*Claims, error) {
	secret := os.Getenv("JWT_SECRET") // step 1: get secret from env

	token, err := jwt.ParseWithClaims( // step 2: parse and validate token
		tokenString,
		&Claims{},
		func(token *jwt.Token) (interface{}, error) {
			// enforce HMAC - reject tokens signed with other algorithms
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return []byte(secret), nil
		})
	
		
	if err != nil || !token.Valid {
		return nil, fmt.Errorf("invalid token: %w", err)
	}

	claims, ok := token.Claims.(*Claims) // step 3: extract claims
	if !ok {
		return nil, fmt.Errorf("invalid token claims type")
	}

	return claims, nil // step 4: return claims
}