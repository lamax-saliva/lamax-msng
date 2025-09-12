import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.*;

import java.io.File;
import java.util.*;

@SpringBootApplication
public class Mainmain {
    public static void main(String[] args) {
        SpringApplication.run(Mainmain.class, args);
    }
}

// Модель пользователя
class User {
    public String username;
    public String password;
}

// Список пользователей
class UserList {
    public List<User> users;
}

@RestController
@RequestMapping("/api")
class UserController {
    private static final String USER_FILE = "User.json";
    private static UserList userList;

    static {
        try {
            ObjectMapper mapper = new ObjectMapper();
            userList = mapper.readValue(new File(USER_FILE), UserList.class);
        } catch (Exception e) {
            e.printStackTrace();
            userList = new UserList();
            userList.users = new ArrayList<>();
        }
    }

    // Проверка логина и пароля
    @PostMapping("/login")
    public String login(@RequestBody Map<String, String> data) {
        String username = data.get("username");
        String password = data.get("password");

        for (User user : userList.users) {
            if (user.username.equals(username) && user.password.equals(password)) {
                return "OK";
            }
        }
        throw new RuntimeException("Неверный логин или пароль");
    }
}
