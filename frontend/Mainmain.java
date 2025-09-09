import javax.swing.*;
import java.awt.*;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

public class Mainmain {
    private static JFrame frame;
    private static JPanel messagesPanel;
    private static List<String> conversationHistory = new ArrayList<>();
    private static int currentChat = 0; // 0: Дизайн-студия, 1: Личные сообщения, 2: Команда проекта

    // Примеры сообщений для разных чатов
    private static String[][] chatMessages = {
            {
                    "Анна Дизайнер: Привет! Посмотрите на новый концепт интерфейса.",
                    "Вы: Мне нравится! Особенно нестандартное расположение элементов.",
                    "Макс Разработчик: Я уже начал реализовывать этот дизайн.",
                    "Вы: Отлично! Не забудь про анимации и микровзаимодействия."
            },
            {
                    "Анна: Привет! Как насчет встречи завтра?",
                    "Вы: Конечно! В 15:00 подойдет?",
                    "Анна: Идеально! Покажу новые макеты."
            },
            {
                    "Макс: Нашел баг в основном модуле.",
                    "Оля: Срочно нужно исправить!",
                    "Иван: Я могу помочь с тестированием.",
                    "Вы: Давайте соберемся в 16:00 для обсуждения."
            }
    };

    private static String[] chatNames = {"Дизайн-студия", "Анна Дизайнер", "Команда проекта"};
    private static String[] chatDescriptions = {"Обсуждаем креативные идеи", "Личные сообщения", "Рабочие вопросы"};

    public static void main(String[] args) {
        // Создаем главное окно с уникальным дизайном
        frame = new JFrame("Nexus Messenger");
        frame.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        frame.setSize(1000, 700);
        frame.setLayout(new BorderLayout());
        frame.getContentPane().setBackground(new Color(26, 28, 35));

        // Создаем основную панель с разделением на две части
        JSplitPane splitPane = new JSplitPane(JSplitPane.HORIZONTAL_SPLIT);
        splitPane.setDividerLocation(250);
        splitPane.setDividerSize(2);
        splitPane.setContinuousLayout(true);

        // Левая панель - список чатов
        JPanel chatsPanel = createChatsPanel();

        // Правая панель - текущий чат
        JPanel chatPanel = createChatPanel();

        splitPane.setLeftComponent(chatsPanel);
        splitPane.setRightComponent(chatPanel);

        frame.add(splitPane, BorderLayout.CENTER);

        // Добавляем статус бар
        JPanel statusBar = new JPanel(new FlowLayout(FlowLayout.RIGHT));
        statusBar.setBackground(new Color(42, 44, 51));
        JLabel status = new JLabel("Status: Online ●");
        status.setForeground(new Color(105, 240, 174));
        statusBar.add(status);
        statusBar.setBorder(BorderFactory.createEmptyBorder(5, 0, 5, 20));

        frame.add(statusBar, BorderLayout.SOUTH);
        frame.setVisible(true);

        // Загружаем первый чат
        loadChat(0);
    }

    private static JPanel createChatsPanel() {
        JPanel chatsPanel = new JPanel();
        chatsPanel.setLayout(new BorderLayout());
        chatsPanel.setBackground(new Color(42, 44, 51));
        chatsPanel.setPreferredSize(new Dimension(250, frame.getHeight()));

        // Заголовок
        JLabel title = new JLabel("Чаты", SwingConstants.CENTER);
        title.setFont(new Font("Segoe UI", Font.BOLD, 20));
        title.setForeground(new Color(245, 247, 255));
        title.setBorder(BorderFactory.createEmptyBorder(20, 0, 20, 0));
        chatsPanel.add(title, BorderLayout.NORTH);

        // Панель с кнопками чатов
        JPanel chatListPanel = new JPanel();
        chatListPanel.setLayout(new BoxLayout(chatListPanel, BoxLayout.Y_AXIS));
        chatListPanel.setBackground(new Color(42, 44, 51));

        // Создаем элементы списка чатов
        for (int i = 0; i < chatNames.length; i++) {
            JPanel chatItem = createChatItem(chatNames[i], chatDescriptions[i], i);
            chatListPanel.add(chatItem);
        }

        JScrollPane scrollPane = new JScrollPane(chatListPanel);
        scrollPane.setBorder(BorderFactory.createEmptyBorder());
        scrollPane.getVerticalScrollBar().setUI(new CustomScrollBarUI());
        chatsPanel.add(scrollPane, BorderLayout.CENTER);

        return chatsPanel;
    }

    private static JPanel createChatItem(String name, String description, int chatId) {
        JPanel chatItem = new JPanel();
        chatItem.setLayout(new BorderLayout());
        chatItem.setBackground(new Color(42, 44, 51));
        chatItem.setBorder(BorderFactory.createEmptyBorder(10, 15, 10, 15));
        chatItem.setCursor(new Cursor(Cursor.HAND_CURSOR));

        // Добавляем обработчик клика
        chatItem.addMouseListener(new MouseAdapter() {
            @Override
            public void mouseClicked(MouseEvent e) {
                loadChat(chatId);
            }

            @Override
            public void mouseEntered(MouseEvent e) {
                chatItem.setBackground(new Color(60, 62, 70));
            }

            @Override
            public void mouseExited(MouseEvent e) {
                chatItem.setBackground(new Color(42, 44, 51));
            }
        });

        JLabel nameLabel = new JLabel(name);
        nameLabel.setFont(new Font("Segoe UI", Font.BOLD, 16));
        nameLabel.setForeground(new Color(245, 247, 255));

        JLabel descLabel = new JLabel(description);
        descLabel.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        descLabel.setForeground(new Color(180, 180, 190));

        JPanel textPanel = new JPanel();
        textPanel.setLayout(new BoxLayout(textPanel, BoxLayout.Y_AXIS));
        textPanel.setBackground(new Color(42, 44, 51));
        textPanel.add(nameLabel);
        textPanel.add(descLabel);

        chatItem.add(textPanel, BorderLayout.CENTER);

        // Индикатор непрочитанных сообщений
        JLabel unreadLabel = new JLabel("3");
        unreadLabel.setFont(new Font("Segoe UI", Font.BOLD, 12));
        unreadLabel.setForeground(Color.WHITE);
        unreadLabel.setBackground(new Color(126, 87, 194));
        unreadLabel.setOpaque(true);
        unreadLabel.setBorder(BorderFactory.createEmptyBorder(3, 8, 3, 8));
        unreadLabel.setPreferredSize(new Dimension(25, 20));
        unreadLabel.setHorizontalAlignment(SwingConstants.CENTER);

        // Сделаем круглую форму для индикатора
        unreadLabel.setBorder(BorderFactory.createEmptyBorder(3, 8, 3, 8));

        chatItem.add(unreadLabel, BorderLayout.EAST);

        return chatItem;
    }

    private static JPanel createChatPanel() {
        JPanel chatPanel = new JPanel();
        chatPanel.setLayout(new BorderLayout());
        chatPanel.setBackground(new Color(35, 37, 44));

        // Заголовок чата
        JPanel headerPanel = new JPanel(new BorderLayout());
        headerPanel.setBackground(new Color(42, 44, 51));
        headerPanel.setBorder(BorderFactory.createEmptyBorder(15, 20, 15, 20));
        headerPanel.setPreferredSize(new Dimension(frame.getWidth(), 70));

        JLabel chatTitle = new JLabel("Дизайн-студия");
        chatTitle.setFont(new Font("Segoe UI", Font.BOLD, 20));
        chatTitle.setForeground(new Color(245, 247, 255));

        JLabel chatDesc = new JLabel("Обсуждаем креативные идеи");
        chatDesc.setFont(new Font("Segoe UI", Font.PLAIN, 14));
        chatDesc.setForeground(new Color(180, 180, 190));

        JPanel titlePanel = new JPanel();
        titlePanel.setLayout(new BoxLayout(titlePanel, BoxLayout.Y_AXIS));
        titlePanel.setBackground(new Color(42, 44, 51));
        titlePanel.add(chatTitle);
        titlePanel.add(chatDesc);

        headerPanel.add(titlePanel, BorderLayout.WEST);

        // Кнопки действий в заголовке
        JPanel actionPanel = new JPanel(new FlowLayout(FlowLayout.RIGHT, 10, 0));
        actionPanel.setBackground(new Color(42, 44, 51));

        JButton callButton = createHeaderButton("📞");
        JButton videoButton = createHeaderButton("🎥");
        JButton infoButton = createHeaderButton("ⓘ");

        actionPanel.add(callButton);
        actionPanel.add(videoButton);
        actionPanel.add(infoButton);

        headerPanel.add(actionPanel, BorderLayout.EAST);

        chatPanel.add(headerPanel, BorderLayout.NORTH);

        // Панель сообщений
        messagesPanel = new JPanel();
        messagesPanel.setLayout(new BoxLayout(messagesPanel, BoxLayout.Y_AXIS));
        messagesPanel.setBackground(new Color(35, 37, 44));
        messagesPanel.setBorder(BorderFactory.createEmptyBorder(20, 20, 20, 20));

        JScrollPane scrollPane = new JScrollPane(messagesPanel);
        scrollPane.setBorder(BorderFactory.createEmptyBorder());
        scrollPane.getVerticalScrollBar().setUI(new CustomScrollBarUI());
        scrollPane.getVerticalScrollBar().setUnitIncrement(16);

        chatPanel.add(scrollPane, BorderLayout.CENTER);

        // Панель ввода сообщения
        JPanel inputPanel = new JPanel(new BorderLayout());
        inputPanel.setBackground(new Color(42, 44, 51));
        inputPanel.setBorder(BorderFactory.createEmptyBorder(15, 15, 15, 15));

        JTextField messageField = new JTextField();
        messageField.setFont(new Font("Segoe UI", Font.PLAIN, 14));
        messageField.setBackground(new Color(60, 62, 70));
        messageField.setForeground(Color.WHITE);
        messageField.setCaretColor(Color.WHITE);
        messageField.setBorder(BorderFactory.createCompoundBorder(
                BorderFactory.createLineBorder(new Color(80, 82, 90)),
                BorderFactory.createEmptyBorder(10, 15, 10, 15)
        ));

        // Обработка отправки сообщения по Enter
        messageField.addActionListener(new ActionListener() {
            @Override
            public void actionPerformed(ActionEvent e) {
                sendMessage(messageField.getText());
                messageField.setText("");
            }
        });

        JPanel buttonPanel = new JPanel(new FlowLayout(FlowLayout.RIGHT, 5, 0));
        buttonPanel.setBackground(new Color(42, 44, 51));

        JButton emojiButton = createInputButton("😊");
        JButton attachButton = createInputButton("📎");
        JButton sendButton = createInputButton("➤");

        // Обработка отправки сообщения по кнопке
        sendButton.addActionListener(new ActionListener() {
            @Override
            public void actionPerformed(ActionEvent e) {
                sendMessage(messageField.getText());
                messageField.setText("");
            }
        });

        buttonPanel.add(emojiButton);
        buttonPanel.add(attachButton);
        buttonPanel.add(sendButton);

        inputPanel.add(messageField, BorderLayout.CENTER);
        inputPanel.add(buttonPanel, BorderLayout.EAST);

        chatPanel.add(inputPanel, BorderLayout.SOUTH);

        return chatPanel;
    }

    private static JButton createHeaderButton(String text) {
        JButton button = new JButton(text);
        button.setFont(new Font("Segoe UI", Font.PLAIN, 16));
        button.setBackground(new Color(60, 62, 70));
        button.setForeground(Color.WHITE);
        button.setBorder(BorderFactory.createEmptyBorder(8, 12, 8, 12));
        button.setCursor(new Cursor(Cursor.HAND_CURSOR));

        button.addMouseListener(new MouseAdapter() {
            @Override
            public void mouseEntered(MouseEvent e) {
                button.setBackground(new Color(126, 87, 194));
            }

            @Override
            public void mouseExited(MouseEvent e) {
                button.setBackground(new Color(60, 62, 70));
            }
        });

        return button;
    }

    private static JButton createInputButton(String text) {
        JButton button = new JButton(text);
        button.setFont(new Font("Segoe UI", Font.PLAIN, 16));
        button.setBackground(new Color(126, 87, 194));
        button.setForeground(Color.WHITE);
        button.setBorder(BorderFactory.createEmptyBorder(10, 15, 10, 15));
        button.setCursor(new Cursor(Cursor.HAND_CURSOR));

        button.addMouseListener(new MouseAdapter() {
            @Override
            public void mouseEntered(MouseEvent e) {
                button.setBackground(new Color(105, 70, 170));
            }

            @Override
            public void mouseExited(MouseEvent e) {
                button.setBackground(new Color(126, 87, 194));
            }
        });

        return button;
    }

    private static void loadChat(int chatId) {
        currentChat = chatId;
        messagesPanel.removeAll();

        // Добавляем сообщения из выбранного чата
        for (String message : chatMessages[chatId]) {
            boolean isOutgoing = message.startsWith("Вы:");
            addMessageToPanel(message, isOutgoing);
        }

        messagesPanel.revalidate();
        messagesPanel.repaint();
    }

    private static void sendMessage(String text) {
        if (text.trim().isEmpty()) return;

        String fullMessage = "Вы: " + text;
        addMessageToPanel(fullMessage, true);

        // Имитация ответа через 1-2 секунды
        Timer timer = new Timer(1000 + (int)(Math.random() * 1000), new ActionListener() {
            @Override
            public void actionPerformed(ActionEvent e) {
                String[] responses = {
                        "Анна Дизайнер: Отличная идея!",
                        "Макс Разработчик: Уже работаю над этим.",
                        "Оля Маркетолог: Это повысит вовлеченность пользователей.",
                        "Иван Тестировщик: Нужно протестировать перед релизом."
                };

                String response = responses[(int)(Math.random() * responses.length)];
                addMessageToPanel(response, false);
            }
        });

        timer.setRepeats(false);
        timer.start();
    }

    private static void addMessageToPanel(String message, boolean isOutgoing) {
        JPanel messagePanel = new JPanel();
        messagePanel.setLayout(new BorderLayout());
        messagePanel.setOpaque(false);
        messagePanel.setBorder(BorderFactory.createEmptyBorder(5, 10, 5, 10));

        JPanel bubblePanel = new JPanel();
        bubblePanel.setLayout(new BoxLayout(bubblePanel, BoxLayout.Y_AXIS));
        bubblePanel.setBorder(BorderFactory.createEmptyBorder(10, 15, 10, 15));

        // Определяем цвет в зависимости от отправителя
        if (isOutgoing) {
            bubblePanel.setBackground(new Color(126, 87, 194));
        } else {
            bubblePanel.setBackground(new Color(60, 62, 70));
        }

        bubblePanel.setOpaque(true);
        bubblePanel.setBorder(BorderFactory.createCompoundBorder(
                BorderFactory.createLineBorder(new Color(80, 82, 90), 1),
                BorderFactory.createEmptyBorder(10, 15, 10, 15)
        ));

        // Разделяем отправителя и текст сообщения
        String[] parts = message.split(":", 2);
        String sender = parts[0];
        String messageText = parts.length > 1 ? parts[1] : "";

        JLabel senderLabel = new JLabel(sender);
        senderLabel.setFont(new Font("Segoe UI", Font.BOLD, 14));
        senderLabel.setForeground(isOutgoing ? new Color(220, 220, 220) : new Color(170, 200, 240));

        JLabel textLabel = new JLabel(messageText);
        textLabel.setFont(new Font("Segoe UI", Font.PLAIN, 14));
        textLabel.setForeground(Color.WHITE);

        JLabel timeLabel = new JLabel(LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm")));
        timeLabel.setFont(new Font("Segoe UI", Font.PLAIN, 10));
        timeLabel.setForeground(new Color(180, 180, 190));
        timeLabel.setBorder(BorderFactory.createEmptyBorder(5, 0, 0, 0));

        bubblePanel.add(senderLabel);
        bubblePanel.add(textLabel);
        bubblePanel.add(timeLabel);

        if (isOutgoing) {
            messagePanel.add(bubblePanel, BorderLayout.EAST);
        } else {
            messagePanel.add(bubblePanel, BorderLayout.WEST);
        }

        messagesPanel.add(messagePanel);
        messagesPanel.revalidate();
        messagesPanel.repaint();

        // Прокрутка к последнему сообщению
        JViewport viewport = (JViewport) messagesPanel.getParent().getParent();
        viewport.setViewPosition(new Point(0, messagesPanel.getHeight()));
    }

    // Кастомный дизайн для scrollbar
    static class CustomScrollBarUI extends javax.swing.plaf.basic.BasicScrollBarUI {
        @Override
        protected void configureScrollBarColors() {
            this.thumbColor = new Color(80, 82, 90);
            this.trackColor = new Color(42, 44, 51);
        }

        @Override
        protected JButton createDecreaseButton(int orientation) {
            return createZeroButton();
        }

        @Override
        protected JButton createIncreaseButton(int orientation) {
            return createZeroButton();
        }

        private JButton createZeroButton() {
            JButton button = new JButton();
            button.setPreferredSize(new Dimension(0, 0));
            button.setMinimumSize(new Dimension(0, 0));
            button.setMaximumSize(new Dimension(0, 0));
            return button;
        }
    }
}