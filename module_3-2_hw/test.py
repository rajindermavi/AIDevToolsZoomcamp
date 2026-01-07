from main import fetch_markdown_to_file


def main() -> None:
    result = fetch_markdown_to_file("https://example.com")
    print(result)


if __name__ == "__main__":
    main()
